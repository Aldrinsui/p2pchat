export type SignalMessage = {
  type: 'offer' | 'answer' | 'candidate';
  from: string;
  to: string;
  data: any;
  room?: string;
};

class SignalingService {
  private socket: WebSocket | null = null;
  private onSignalCallback: ((msg: SignalMessage) => void) | null = null;
  private myPublicKey: string | null = null;
  private reconnectTimeout: any = null;
  private isExplicitDisconnect: boolean = false;
  private signalQueue: SignalMessage[] = [];

  // Default to localhost for the most reliable/private experience if available
  private relayUrl = localStorage.getItem('secureChat_relayUrl') || 'ws://localhost:8080';
  private currentRoom = 'main';

  setRelayUrl(url: string) {
    this.relayUrl = url;
    localStorage.setItem('secureChat_relayUrl', url);
    
    try {
        const urlObj = new URL(url);
        this.currentRoom = urlObj.searchParams.get('room') || 'main';
    } catch(e) {
        this.currentRoom = 'main';
    }

    if (this.socket) {
      this.disconnect();
      if (this.myPublicKey && this.onSignalCallback) {
        this.connect(this.myPublicKey, this.onSignalCallback);
      }
    }
  }

  getRelayUrl() {
    return this.relayUrl;
  }

  connect(publicKey: string, onSignal: (msg: SignalMessage) => void) {
    this.myPublicKey = publicKey;
    this.onSignalCallback = onSignal;
    this.isExplicitDisconnect = false;

    console.log(`%c[SIG] Connecting to relay: ${this.relayUrl}`, 'color: #9333ea');
    
    // Cleanup existing socket if it exists
    if (this.socket) {
        this.socket.onopen = this.socket.onmessage = this.socket.onclose = this.socket.onerror = null;
        this.socket.close();
    }

    try {
      this.socket = new WebSocket(this.relayUrl);

      this.socket.onopen = () => {
        console.log('%c[SIG] Signaling relay connected.', 'color: #10b981; font-weight: bold');
        window.dispatchEvent(new CustomEvent('signalingStateChange', { detail: { connected: true } }));
        this.flushQueue();
      };

      this.socket.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as SignalMessage;
          if (msg.to === this.myPublicKey && msg.from !== this.myPublicKey) {
            console.log(`%c[SIG] Incoming signal: ${msg.type} from ${msg.from.substring(0, 8)}...`, 'color: #9333ea');
            this.onSignalCallback?.(msg);
          }
        } catch (e) {
          // Non-JSON or malformed signal
        }
      };

      this.socket.onclose = (event) => {
        window.dispatchEvent(new CustomEvent('signalingStateChange', { detail: { connected: false } }));
        if (!this.isExplicitDisconnect) {
          const stateNames = ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'];
          const reason = event.wasClean ? 'Cleanly closed' : `Code: ${event.code}`;
          console.warn(`[SIG] Relay connection lost (${reason}). Socket state: ${stateNames[this.socket?.readyState ?? 3]}. Reconnecting in 3s...`);
          
          clearTimeout(this.reconnectTimeout);
          this.reconnectTimeout = setTimeout(() => {
              if (this.myPublicKey && this.onSignalCallback) {
                  this.connect(this.myPublicKey, this.onSignalCallback);
              }
          }, 3000);
        }
      };

      this.socket.onerror = (err) => {
        console.error('[SIG] WebSocket error encountered. Checking connection URL and server status...', {
            url: this.relayUrl,
            readyState: this.socket?.readyState
        });
      };
    } catch (e) {
      console.error('[SIG] Synchronous connection failure:', e);
    }
  }

  private flushQueue() {
    if (this.signalQueue.length > 0) {
      console.log(`%c[SIG] Flushing ${this.signalQueue.length} queued signals to newly opened socket.`, 'color: #10b981');
      const messages = [...this.signalQueue];
      this.signalQueue = [];
      messages.forEach(msg => this.sendSignal(msg.to, msg.type, msg.data));
    }
  }

  sendSignal(to: string, type: SignalMessage['type'], data: any) {
    if (!this.myPublicKey) return;

    const msg: SignalMessage = {
      type,
      from: this.myPublicKey,
      to,
      data,
      room: this.currentRoom
    };

    // Robust check for socket availability
    if (!this.socket || this.socket.readyState === WebSocket.CONNECTING) {
      console.log(`%c[SIG] Queueing ${type} - Socket is ${this.socket ? 'CONNECTING' : 'OFFLINE'}`, 'color: #c084fc');
      this.signalQueue.push(msg);
      
      // If the socket doesn't exist at all, trigger a connection
      if (!this.socket && this.onSignalCallback) {
          this.connect(this.myPublicKey, this.onSignalCallback);
      }
      return;
    }

    if (this.socket.readyState !== WebSocket.OPEN) {
      console.warn(`%c[SIG] Cannot send ${type}: Socket is ${this.socket.readyState}. Re-queueing.`, 'color: #f59e0b');
      this.signalQueue.push(msg);
      
      // Trigger reconnection if not already in progress
      if (this.socket.readyState > WebSocket.OPEN && this.onSignalCallback) {
          this.connect(this.myPublicKey, this.onSignalCallback);
      }
      return;
    }
    
    try {
        this.socket.send(JSON.stringify(msg));
        console.log(`%c[SIG] Outgoing ${type} sent to ${to.substring(0, 8)}...`, 'color: #c084fc');
    } catch (e) {
        console.error('[SIG] Failed to send signal string:', e);
        this.signalQueue.push(msg);
    }
  }

  disconnect() {
    this.isExplicitDisconnect = true;
    clearTimeout(this.reconnectTimeout);
    if (this.socket) {
        this.socket.onopen = this.socket.onmessage = this.socket.onclose = this.socket.onerror = null;
        this.socket.close();
    }
    this.socket = null;
    this.signalQueue = [];
    window.dispatchEvent(new CustomEvent('signalingStateChange', { detail: { connected: false } }));
    console.log('[SIG] Signaling disconnected and queue cleared.');
  }
}

export const signalingService = new SignalingService();