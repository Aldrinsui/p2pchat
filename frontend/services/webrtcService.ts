import { signalingService, SignalMessage } from './signalingService';

export type P2PStatus = 'offline' | 'connecting' | 'connected';

class WebRTCService {
  private connections: Map<string, RTCPeerConnection> = new Map();
  private dataChannels: Map<string, RTCDataChannel> = new Map();
  private statusCallbacks: Map<string, (status: P2PStatus) => void> = new Map();
  private onMessageCallback: ((from: string, data: string) => void) | null = null;
  private myPublicKey: string = '';

  private config: RTCConfiguration = {
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
  };

  init(myPublicKey: string, onMessage: (from: string, data: string) => void) {
    this.cleanup(); 
    this.myPublicKey = myPublicKey;
    this.onMessageCallback = onMessage;
    signalingService.connect(myPublicKey, (signal) => this.handleSignal(signal));
  }

  cleanup() {
    console.log('%c[RTC] Cleaning up all connections...', 'color: #f43f5e');
    this.dataChannels.forEach(dc => {
      dc.onopen = dc.onclose = dc.onmessage = dc.onerror = null;
      dc.close();
    });
    this.connections.forEach(pc => {
      pc.onicecandidate = pc.oniceconnectionstatechange = pc.ondatachannel = null;
      pc.close();
    });
    this.dataChannels.clear();
    this.connections.clear();
    this.statusCallbacks.clear();
    signalingService.disconnect();
  }

  private async handleSignal(signal: SignalMessage) {
    let pc = this.connections.get(signal.from);

    if (!pc) {
      console.log(`%c[RTC] Creating new PeerConnection for ${signal.from.substring(0, 8)}...`, 'color: #2563eb');
      pc = this.createPeerConnection(signal.from);
    }

    try {
      if (signal.type === 'offer') {
        await pc.setRemoteDescription(new RTCSessionDescription(signal.data));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        signalingService.sendSignal(signal.from, 'answer', answer);
      } else if (signal.type === 'answer') {
        await pc.setRemoteDescription(new RTCSessionDescription(signal.data));
      } else if (signal.type === 'candidate') {
        if (signal.data) {
          await pc.addIceCandidate(new RTCIceCandidate(signal.data));
        }
      }
    } catch (err) {
      console.error(`[RTC] Error handling signal ${signal.type}:`, err);
    }
  }

  private createPeerConnection(peerKey: string): RTCPeerConnection {
    const pc = new RTCPeerConnection(this.config);
    this.connections.set(peerKey, pc);

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        signalingService.sendSignal(peerKey, 'candidate', event.candidate);
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log(`%c[RTC] ICE State (${peerKey.substring(0, 8)}): ${pc.iceConnectionState}`, 'color: #3b82f6');
      let status: P2PStatus = 'offline';
      if (pc.iceConnectionState === 'checking') status = 'connecting';
      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') status = 'connected';
      this.statusCallbacks.get(peerKey)?.(status);
    };

    pc.onconnectionstatechange = () => {
      console.log(`%c[RTC] Conn State (${peerKey.substring(0, 8)}): ${pc.connectionState}`, 'color: #1d4ed8; font-weight: bold');
    };

    pc.ondatachannel = (event) => {
      console.log(`%c[RTC] Remote DataChannel received: ${event.channel.label}`, 'color: #0ea5e9');
      this.setupDataChannel(peerKey, event.channel);
    };

    return pc;
  }

  private setupDataChannel(peerKey: string, channel: RTCDataChannel) {
    this.dataChannels.set(peerKey, channel);
    
    channel.onopen = () => {
      console.log(`%c[RTC] DataChannel '${channel.label}' is OPEN with ${peerKey.substring(0, 8)}`, 'color: #10b981; font-weight: bold');
      this.statusCallbacks.get(peerKey)?.('connected');
    };
    
    channel.onclose = () => {
      console.log(`[RTC] DataChannel '${channel.label}' closed.`);
      this.statusCallbacks.get(peerKey)?.('offline');
      this.dataChannels.delete(peerKey);
    };

    channel.onerror = (err) => {
      console.error(`[RTC] DataChannel Error (${peerKey.substring(0, 8)}):`, err);
    };

    channel.onmessage = (event) => {
      console.log(`%c[RTC] Raw payload received from ${peerKey.substring(0, 8)}:`, 'color: #059669', event.data.substring(0, 100) + '...');
      this.onMessageCallback?.(peerKey, event.data);
    };
  }

  async connectToPeer(peerKey: string) {
    if (this.dataChannels.get(peerKey)?.readyState === 'open') return;

    console.log(`%c[RTC] Initiating P2P handshake with ${peerKey.substring(0, 8)}...`, 'color: #2563eb');
    const pc = this.createPeerConnection(peerKey);
    const channel = pc.createDataChannel('chat');
    this.setupDataChannel(peerKey, channel);

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    signalingService.sendSignal(peerKey, 'offer', offer);
  }

  sendMessage(peerKey: string, message: string): boolean {
    const channel = this.dataChannels.get(peerKey);
    if (channel && channel.readyState === 'open') {
      console.log(`%c[RTC] Sending P2P message to ${peerKey.substring(0, 8)}:`, 'color: #10b981', message.substring(0, 50) + '...');
      channel.send(message);
      return true;
    }
    console.warn(`%c[RTC] Failed to send: DataChannel is ${channel?.readyState || 'non-existent'}`, 'color: #f59e0b');
    return false;
  }

  onStatusChange(peerKey: string, callback: (status: P2PStatus) => void) {
    this.statusCallbacks.set(peerKey, callback);
  }
}

export const webrtcService = new WebRTCService();