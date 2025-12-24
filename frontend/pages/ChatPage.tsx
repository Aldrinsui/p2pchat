import * as React from 'react';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { QRCodeCanvas } from 'qrcode.react';
import type { ECDSAKeys, Contact, Message, MessageFile } from '../types';
import { sign, verify, generateFingerprint } from '../services/cryptoService';
import { truncateKey, copyToClipboard } from '../utils/helpers';
import { webrtcService, P2PStatus } from '../services/webrtcService';
import {
  ArrowLeftIcon, SendIcon, ShieldIcon, ShieldCheckIcon, ShieldAlertIcon, KeyIcon, QrCodeIcon,
  CopyIcon, CheckIcon, MoreVerticalIcon, Trash2Icon, LockIcon, PaperclipIcon, FileIcon,
  MicrophoneIcon, StopCircleIcon, XCircleIcon, PlusIcon
} from '../components/Icons';

// --- Helper Functions ---
const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = error => reject(error);
    });
};

const getSupportedAudioMimeType = (): string | null => {
    const types = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg'];
    for (const type of types) {
        if (MediaRecorder.isTypeSupported(type)) return type;
    }
    return null;
};

// --- Message Sub-component ---
interface MessageBubbleProps {
  message: Message;
  senderPublicKey: string;
}

const MessageBubble: React.FC<MessageBubbleProps> = ({ message, senderPublicKey }) => {
  const [isVerified, setIsVerified] = useState<boolean | null>(null);

  useEffect(() => {
    let isMounted = true;
    const checkVerification = async () => {
      if (message.sender === 'them') {
        const result = await verify(message, senderPublicKey);
        if (isMounted) setIsVerified(result);
      } else {
        setIsVerified(true);
      }
    };
    if (message.state === 'sent' || message.state === 'received') checkVerification();
    return () => { isMounted = false; };
  }, [message, senderPublicKey]);

  const getStatus = () => {
    if (message.state === 'sending') return { text: 'Sending...', icon: <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse"></div> };
    if (message.state === 'failed') return { text: 'Failed', icon: <ShieldAlertIcon className="w-3 h-3 text-red-400" /> };
    if (isVerified === null && message.sender === 'them') return { text: 'Verifying...', icon: <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse"></div> };
    if (isVerified) return { text: 'Verified', icon: <ShieldCheckIcon className="w-3 h-3 text-green-400" /> };
    return { text: 'Not Verified', icon: <ShieldAlertIcon className="w-3 h-3 text-yellow-400" /> };
  };
  
  const status = getStatus();

  const renderFile = (file: MessageFile) => {
    const fileType = file.type.split('/')[0];
    switch(fileType) {
        case 'image': return <img src={file.data} alt={file.name} className="rounded-lg max-w-full h-auto mt-2" />;
        case 'video': return <video src={file.data} controls className="rounded-lg max-w-full h-auto mt-2" />;
        case 'audio': return <audio src={file.data} controls className="w-full mt-2" />;
        default: return (
            <a href={file.data} download={file.name} className="flex items-center space-x-3 bg-white/10 p-3 rounded-lg mt-2 hover:bg-white/20 transition-colors">
                <FileIcon className="w-8 h-8 text-gray-300" />
                <div className="text-left"><p className="text-sm font-medium">{file.name}</p><p className="text-xs text-gray-400">{(file.size / 1024).toFixed(2)} KB</p></div>
            </a>
        );
    }
  }

  return (
    <div className={`flex ${message.sender === 'you' ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-xs lg:max-w-md px-4 py-3 rounded-2xl ${message.sender === 'you' ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white' : 'bg-white/10 backdrop-blur-md text-white border border-white/20'} ${message.state === 'sending' ? 'opacity-70' : ''}`}>
        {message.file && renderFile(message.file)}
        {message.content && <p className={`text-sm leading-relaxed whitespace-pre-wrap break-words ${message.file ? 'mt-2' : ''}`}>{message.content}</p>}
        <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/20">
          <div className="flex items-center space-x-2 text-xs text-gray-300">{status.icon}<span>{status.text}</span></div>
          <LockIcon className="w-3 h-3 text-gray-400" title="Signature Attached" />
        </div>
      </div>
    </div>
  );
};

// --- Main Chat Page Component ---
const ChatPage: React.FC<{ keys: ECDSAKeys }> = ({ keys }) => {
  const { contactId } = useParams();
  const navigate = useNavigate();

  const [contact, setContact] = useState<Contact | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [attachment, setAttachment] = useState<File | null>(null);
  const [p2pStatus, setP2PStatus] = useState<P2PStatus>('offline');
  
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);

  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [fingerprint, setFingerprint] = useState('');
  const [copiedItem, setCopiedItem] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB

  const refreshMessages = useCallback(() => {
      if (!contactId) return;
      const savedMessages: Message[] = JSON.parse(localStorage.getItem(`messages_${contactId}`) || '[]');
      setMessages(savedMessages);
  }, [contactId]);

  useEffect(() => {
    try {
      const allContacts: Contact[] = JSON.parse(localStorage.getItem('secureChat_contacts') || '[]');
      const currentContact = allContacts.find(c => c.id === Number(contactId));
      if (currentContact) {
        setContact(currentContact);
        refreshMessages();
        
        webrtcService.onStatusChange(currentContact.publicKey, (status) => {
            console.log(`[UI] P2P Status changed: ${status}`);
            setP2PStatus(status);
        });
        webrtcService.connectToPeer(currentContact.publicKey);

      } else navigate('/home');
    } catch (e) { console.error("Failed to load chat data", e); navigate('/home'); }
  }, [contactId, navigate, refreshMessages]);

  useEffect(() => {
      const handleNewP2P = (e: any) => {
          if (e.detail.contactId === Number(contactId)) {
              console.log(`[UI] Received custom event for new P2P message, refreshing list.`);
              refreshMessages();
          }
      };
      window.addEventListener('newP2PMessage', handleNewP2P);
      return () => window.removeEventListener('newP2PMessage', handleNewP2P);
  }, [contactId, refreshMessages]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);
  
  const saveMessages = (updatedMessages: Message[]) => {
      if (!contact) return;
      localStorage.setItem(`messages_${contact.id}`, JSON.stringify(updatedMessages));
      setMessages(updatedMessages);
  }

  const handleSendMessage = async () => {
    if ((!newMessage.trim() && !attachment && !audioBlob) || !contact || !keys) return;
    
    console.group('Message Lifecycle');
    const tempId = Date.now();
    let messageFile: MessageFile | undefined;
    if (attachment) {
        const data = await fileToBase64(attachment);
        messageFile = { name: attachment.name, type: attachment.type, size: attachment.size, data };
    } else if (audioBlob) {
        const fileExtension = audioBlob.type.split('/')[1].split(';')[0];
        const fileName = `voice-message-${Date.now()}.${fileExtension}`;
        const data = await fileToBase64(new File([audioBlob], fileName, { type: audioBlob.type }));
        messageFile = { name: fileName, type: audioBlob.type, size: audioBlob.size, data };
    }
    const messagePayload: Omit<Message, 'id' | 'signature' | 'state'> = {
        contactId: contact.id, sender: 'you', content: newMessage.trim(), file: messageFile, timestamp: Date.now(),
    };
    
    const tempMessage: Message = { ...messagePayload, id: tempId, signature: '', state: 'sending' };
    setNewMessage(''); setAttachment(null); setAudioBlob(null);
    const messagesWithTemp = [...messages, tempMessage];
    saveMessages(messagesWithTemp);

    try {
        const signature = await sign(messagePayload, keys.privateKey);
        const finalMessage: Message = { ...tempMessage, signature, state: 'sent' };
        
        console.log('[UI] Handing off message to P2P service.');
        const delivered = webrtcService.sendMessage(contact.publicKey, JSON.stringify(finalMessage));
        
        if (!delivered) {
            console.warn("[UI] Message delivery failed (Peer offline).");
        }
        
        saveMessages(messagesWithTemp.map(m => m.id === tempId ? finalMessage : m));
    } catch (error) {
        console.error("[UI] Sending failed:", error);
        const failedMessage: Message = { ...tempMessage, state: 'failed' };
        saveMessages(messagesWithTemp.map(m => m.id === tempId ? failedMessage : m));
    } finally {
        console.groupEnd();
    }
  };
  
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
        if (file.size > MAX_FILE_SIZE) { alert(`File too large. Max size is ${MAX_FILE_SIZE / 1024 / 1024}MB.`); return; }
        setAttachment(file); setAudioBlob(null);
    }
  };
  
  const handleStartRecording = async () => {
      const mimeType = getSupportedAudioMimeType();
      if (!mimeType) { alert("Audio recording not supported."); return; }
      try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          mediaRecorderRef.current = new MediaRecorder(stream, { mimeType });
          const audioChunks: BlobPart[] = [];
          mediaRecorderRef.current.ondataavailable = event => { audioChunks.push(event.data); };
          mediaRecorderRef.current.onstop = () => {
              const audioBlob = new Blob(audioChunks, { type: mimeType });
              setAudioBlob(audioBlob);
              stream.getTracks().forEach(track => track.stop());
          };
          mediaRecorderRef.current.start();
          setIsRecording(true); setAttachment(null);
      } catch (err) { alert('Microphone access denied.'); }
  };

  const handleStopRecording = () => {
      if (mediaRecorderRef.current && isRecording) { mediaRecorderRef.current.stop(); setIsRecording(false); }
  };

  const handleShowVerification = async () => {
    if(!contact) return;
    const fp = await generateFingerprint(contact.publicKey);
    setFingerprint(fp);
    setShowVerificationModal(true);
  }

  const handleCopyToClipboard = async (text: string, item: string) => {
    if (await copyToClipboard(text)) { setCopiedItem(item); setTimeout(() => setCopiedItem(null), 2000); }
  };

  if (!contact) return <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white">Loading chat...</div>;

  const statusColors = {
      offline: 'bg-gray-500',
      connecting: 'bg-yellow-500 animate-pulse',
      connected: 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]'
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex flex-col font-sans text-white">
      <header className="bg-black/20 backdrop-blur-md border-b border-white/10 flex-shrink-0 sticky top-0 z-20">
        <div className="max-w-4xl mx-auto px-4 py-4"><div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
              <button onClick={() => navigate('/home')} className="p-2 -ml-2 hover:bg-white/10 rounded-lg transition-colors"><ArrowLeftIcon className="w-5 h-5 text-white" /></button>
              <div className="flex items-center space-x-3">
                  <div className="relative">
                    <div className="w-10 h-10 bg-gradient-to-tr from-green-500 to-emerald-600 rounded-full flex items-center justify-center">
                        <ShieldIcon className="w-5 h-5 text-white" />
                    </div>
                    <div className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-slate-900 ${statusColors[p2pStatus]}`} title={`P2P Status: ${p2pStatus}`} />
                  </div>
                  <div>
                    <h1 className="text-lg font-semibold text-white">{contact.nickname}</h1>
                    <div className="flex items-center space-x-2">
                        <code className="text-[10px] text-gray-400 font-mono uppercase tracking-widest">
                            {p2pStatus === 'connected' ? 'Secure P2P Link' : p2pStatus}
                        </code>
                    </div>
                  </div>
              </div>
          </div>
          <div className="flex items-center space-x-2">
              <button onClick={handleShowVerification} className="p-2 hover:bg-white/10 rounded-lg transition-colors" title="Verify key fingerprint"><KeyIcon className="w-5 h-5 text-gray-400" /></button>
              <div className="relative">
                  <button onClick={() => setShowMenu(!showMenu)} className="p-2 hover:bg-white/10 rounded-lg transition-colors"><MoreVerticalIcon className="w-5 h-5 text-gray-400" /></button>
                  {showMenu && <div className="absolute right-0 top-12 bg-gray-800 rounded-lg border border-gray-700 shadow-xl z-10 w-48"><button onClick={() => {if(confirm('Clear chat?')){saveMessages([]); setShowMenu(false);}}} className="w-full flex items-center space-x-3 px-4 py-3 hover:bg-gray-700 transition-colors text-left"><Trash2Icon className="w-4 h-4 text-red-400" /><span className="text-white text-sm">Clear Messages</span></button></div>}
              </div>
          </div>
        </div></div>
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-6 max-w-4xl mx-auto w-full">
          {p2pStatus !== 'connected' && (
              <div className="mb-6 bg-white/5 border border-white/10 rounded-xl p-4 text-center">
                  <p className="text-xs text-gray-400 italic">Attempting secure P2P handshake... Messages will sync once peer is online.</p>
              </div>
          )}
          <div className="space-y-4">
            {messages.map((message) => <MessageBubble key={message.id} message={message} senderPublicKey={contact.publicKey} />)}
            <div ref={messagesEndRef} />
          </div>
      </main>

      <footer className="flex-shrink-0 bg-black/20 backdrop-blur-md border-t border-white/10 sticky bottom-0 z-10">
        <div className="max-w-4xl mx-auto px-4 pt-3 pb-4">
            {(attachment || audioBlob) && <div className="p-2 mb-2 bg-gray-800/50 rounded-lg flex items-center space-x-3"><div className="flex-1 text-left"><p className="text-sm text-white truncate">{attachment?.name || 'Voice Message'}</p></div><button onClick={() => {setAttachment(null); setAudioBlob(null);}} className="p-1"><XCircleIcon className="w-5 h-5"/></button></div>}
            <div className="flex items-end space-x-3">
                <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" />
                <button onClick={() => fileInputRef.current?.click()} className="p-3 bg-white/10 hover:bg-white/20 text-white rounded-2xl transition-colors"><PaperclipIcon className="w-5 h-5"/></button>
                <div className="flex-1 bg-white/10 backdrop-blur-md rounded-2xl border border-white/20"><textarea value={newMessage} onChange={(e) => setNewMessage(e.target.value)} placeholder="Type your message..." className="w-full bg-transparent text-white placeholder-gray-400 px-4 py-3 resize-none focus:outline-none" rows={1}/></div>
                {isRecording ? (<button onClick={handleStopRecording} className="p-3 bg-red-600 text-white rounded-2xl animate-pulse"><StopCircleIcon className="w-5 h-5" /></button>) : (newMessage.trim() || attachment || audioBlob) ? (<button onClick={handleSendMessage} className="p-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-2xl"><SendIcon className="w-5 h-5" /></button>) : (<button onClick={handleStartRecording} className="p-3 bg-white/10 hover:bg-white/20 text-white rounded-2xl"><MicrophoneIcon className="w-5 h-5" /></button>)}
            </div>
            <div className="flex items-center justify-center mt-2 text-[10px] text-gray-500 space-x-2 font-bold uppercase tracking-widest"><LockIcon className="w-3 h-3" /><span>End-to-End Signed</span></div>
        </div>
      </footer>

      {showVerificationModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-slate-900 rounded-3xl p-8 max-w-md w-full border border-white/10 shadow-2xl animate-scale-up">
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-2xl font-bold text-white flex items-center space-x-3">
                <ShieldCheckIcon className="w-6 h-6 text-blue-400" />
                <span>Verify Identity</span>
              </h3>
              <button onClick={() => setShowVerificationModal(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                <PlusIcon className="w-6 h-6 rotate-45" />
              </button>
            </div>
            
            <div className="space-y-6">
              <div className="flex flex-col items-center justify-center bg-white p-6 rounded-2xl mb-4">
                <QRCodeCanvas value={contact.publicKey} size={180} />
                <p className="mt-4 text-[10px] text-gray-500 font-bold uppercase tracking-widest">Contact's Public Key QR</p>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">Fingerprint (SHA-256)</label>
                <div className="bg-white/5 border border-white/10 rounded-xl p-4 text-center">
                  <code className="text-xl font-mono text-blue-400 tracking-tighter">{fingerprint}</code>
                </div>
              </div>

              <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 text-xs text-blue-200 leading-relaxed">
                <strong>Safety Check:</strong> Compare this fingerprint with your contact in-person or via voice call. If it doesn't match exactly, do not trust this session.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatPage;