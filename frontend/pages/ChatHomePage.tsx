import * as React from 'react';
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ECDSAKeys, Contact } from '../types';
import {
  UsersIcon, UserPlusIcon, MessageCircleIcon, SettingsIcon, KeyIcon, CopyIcon, CheckIcon, 
  DownloadIcon, RefreshCwIcon, ShieldIcon, Trash2Icon, EyeIcon, EyeOffIcon, HashIcon, 
  EditIcon, QrCodeIcon, LogOutIcon, InfoIcon, ShieldCheckIcon, PlusIcon, GlobeIcon
} from '../components/Icons';
import { downloadKeyFile } from '../services/cryptoService';
import { truncateKey, copyToClipboard } from '../utils/helpers';
import { signalingService } from '../services/signalingService';

interface ChatHomePageProps {
    keys: ECDSAKeys | null;
    onStartOver: () => void;
}

const ChatHomePage: React.FC<ChatHomePageProps> = ({ keys, onStartOver }) => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('people');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [newContactKey, setNewContactKey] = useState('');
  const [showAddContact, setShowAddContact] = useState(false);
  const [copiedItem, setCopiedItem] = useState<string | number | null>(null);
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [showSecurityDocs, setShowSecurityDocs] = useState(false);
  const [showLogoutWarning, setShowLogoutWarning] = useState(false);
  const [isSignalingConnected, setIsSignalingConnected] = useState(false);
  const [relayUrl, setRelayUrl] = useState(signalingService.getRelayUrl());

  useEffect(() => {
    const saved = localStorage.getItem('secureChat_contacts');
    if (saved) setContacts(JSON.parse(saved));

    const handleState = (e: any) => setIsSignalingConnected(e.detail.connected);
    window.addEventListener('signalingStateChange', handleState);
    return () => window.removeEventListener('signalingStateChange', handleState);
  }, []);

  const handleCopyToClipboard = useCallback(async (text: string, item: string | number) => {
    if (await copyToClipboard(text)) {
      setCopiedItem(item);
      setTimeout(() => setCopiedItem(null), 2000);
    }
  }, []);

  const addContact = () => {
    if (!newContactKey.trim()) return;
    const updated = [...contacts, {
      id: Date.now(),
      publicKey: newContactKey.trim(),
      nickname: `Contact #${contacts.length + 1}`,
      addedAt: new Date().toISOString()
    }];
    setContacts(updated);
    localStorage.setItem('secureChat_contacts', JSON.stringify(updated));
    setNewContactKey('');
    setShowAddContact(false);
  };

  const removeContact = (id: number) => {
    const updated = contacts.filter(c => c.id !== id);
    setContacts(updated);
    localStorage.setItem('secureChat_contacts', JSON.stringify(updated));
  };

  const updateRelay = () => {
    signalingService.setRelayUrl(relayUrl);
    alert('Relay URL updated. Signaling will restart.');
  };

  if (!keys) return null;

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 font-sans text-white">
      <header className="bg-black/40 backdrop-blur-md border-b border-white/10 sticky top-0 z-30 p-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-500/20">
              <ShieldIcon className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-xl font-bold">SecureChat</h1>
                <div className={`w-2 h-2 rounded-full ${isSignalingConnected ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-red-500'} transition-all`} title={isSignalingConnected ? 'Signaling Online' : 'Signaling Offline'} />
              </div>
              <p className="text-[10px] uppercase text-blue-400 font-bold tracking-widest">Encrypted Node</p>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <div className="hidden md:block text-right">
              <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Local ID</p>
              <code className="text-xs text-blue-400 font-mono">{truncateKey(keys.publicKey, 8, 8)}</code>
            </div>
            <button onClick={() => setShowLogoutWarning(true)} className="p-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-xl border border-red-500/20 flex items-center space-x-2 group transition-all">
                <LogOutIcon className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
                <span className="hidden sm:inline text-sm font-semibold">Log Out</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        <nav className="flex space-x-1 bg-white/5 rounded-2xl p-1.5 border border-white/10 mb-8">
          {[
            { id: 'people', label: 'People', icon: UsersIcon },
            { id: 'groups', label: 'Groups', icon: HashIcon },
            { id: 'settings', label: 'Settings', icon: SettingsIcon }
          ].map(tab => (
            <button key={tab.id} onClick={() => tab.id === 'groups' ? navigate('/groups') : setActiveTab(tab.id)} className={`flex-1 flex items-center justify-center space-x-2 py-3 px-4 rounded-xl transition-all ${activeTab === tab.id ? 'bg-white/10 text-white ring-1 ring-white/20 shadow-lg' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>
                <tab.icon className={`w-5 h-5 ${activeTab === tab.id ? 'text-blue-400' : ''}`} />
                <span className="font-semibold text-sm">{tab.label}</span>
            </button>
          ))}
        </nav>

        <div className="bg-white/5 backdrop-blur-md rounded-3xl border border-white/10 min-h-[500px] shadow-2xl overflow-hidden">
          {activeTab === 'people' && (
            <div className="p-8">
              <div className="flex justify-between items-center mb-8">
                <div><h2 className="text-2xl font-bold">Contacts</h2><p className="text-sm text-gray-400">Verified peer connections</p></div>
                <div className="flex space-x-2">
                  <button onClick={() => navigate('/qr')} className="bg-purple-600/20 text-purple-300 border border-purple-600/30 px-4 py-2 rounded-xl flex items-center space-x-2 transition-colors hover:bg-purple-600/30"><QrCodeIcon className="w-4 h-4" /><span className="text-sm font-bold">Scan QR</span></button>
                  <button onClick={() => setShowAddContact(!showAddContact)} className="bg-blue-600 px-4 py-2 rounded-xl flex items-center space-x-2 transition-colors hover:bg-blue-700 shadow-lg shadow-blue-600/20"><UserPlusIcon className="w-4 h-4" /><span className="text-sm font-bold">Add Manual</span></button>
                </div>
              </div>

              {showAddContact && (
                <div className="bg-white/5 p-4 rounded-2xl border border-white/5 mb-8 animate-fade-in flex space-x-2">
                  <input type="text" value={newContactKey} onChange={(e) => setNewContactKey(e.target.value)} placeholder="Paste recipient's public key..." className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-sm font-mono text-white placeholder-gray-500" />
                  <button onClick={addContact} className="bg-blue-600 px-6 py-2 rounded-xl font-bold hover:bg-blue-700 transition-all">Add</button>
                </div>
              )}

              {contacts.length === 0 ? (
                <div className="text-center py-24 text-gray-500 space-y-4">
                  <UsersIcon className="w-16 h-16 mx-auto mb-2 opacity-10" />
                  <p className="text-lg">No verified contacts yet.</p>
                  <p className="text-sm max-w-xs mx-auto">Share your Public Key with someone to start a zero-knowledge conversation.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {contacts.map(c => (
                    <div key={c.id} className="bg-white/5 hover:bg-white/10 p-5 rounded-2xl border border-white/5 flex items-center justify-between group transition-all">
                      <div className="flex items-center space-x-4">
                        <div className="w-10 h-10 bg-blue-500/20 rounded-full flex items-center justify-center font-bold text-blue-400">{c.nickname[0].toUpperCase()}</div>
                        <div>
                            <div className="flex items-center space-x-2">
                                <h3 className="font-bold">{c.nickname}</h3>
                                <ShieldCheckIcon className="w-3.5 h-3.5 text-green-500" title="Key Verified" />
                            </div>
                            <code className="text-[10px] text-gray-500 font-mono">{truncateKey(c.publicKey, 12, 12)}</code>
                        </div>
                      </div>
                      <div className="flex space-x-2">
                        <button onClick={() => navigate(`/chat/${c.id}`)} className="bg-blue-600/10 text-blue-400 px-4 py-2 rounded-xl text-sm font-bold hover:bg-blue-600 hover:text-white transition-all">Chat</button>
                        <button onClick={() => removeContact(c.id)} className="p-2 text-gray-500 hover:text-red-400 transition-colors"><Trash2Icon className="w-5 h-5"/></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="p-8 space-y-8">
              <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold">Settings</h2>
                <button onClick={() => setShowSecurityDocs(true)} className="flex items-center space-x-2 text-blue-400 hover:text-blue-300 transition-colors"><InfoIcon className="w-5 h-5" /><span className="text-sm font-bold">How it Works</span></button>
              </div>

              <div className="bg-white/5 rounded-3xl p-6 border border-white/10 space-y-8">
                <div>
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-2">Public Identity (Share this)</label>
                  <div className="flex items-center space-x-2 bg-black/40 p-4 rounded-xl border border-white/5">
                    <code className="flex-1 text-[11px] text-gray-300 font-mono break-all leading-relaxed">{keys.publicKey}</code>
                    <button onClick={() => handleCopyToClipboard(keys.publicKey, 'pub')} className="p-2.5 bg-blue-600/20 text-blue-400 hover:bg-blue-600 hover:text-white rounded-lg transition-all">{copiedItem === 'pub' ? <CheckIcon className="w-5 h-5" /> : <CopyIcon className="w-5 h-5" />}</button>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-red-500 uppercase tracking-widest block mb-2">Secret Private Key (Never Share)</label>
                  <div className="flex items-center space-x-2 bg-black/40 p-4 rounded-xl border border-red-500/10">
                    <code className="flex-1 text-[11px] text-gray-300 font-mono tracking-widest leading-relaxed">{showPrivateKey ? keys.privateKey : '••••••••••••••••••••••••••••••••••••••••'}</code>
                    <button onClick={() => setShowPrivateKey(!showPrivateKey)} className="p-2.5 text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-all">{showPrivateKey ? <EyeOffIcon className="w-5 h-5" /> : <EyeIcon className="w-5 h-5" />}</button>
                  </div>
                </div>

                <div className="border-t border-white/10 pt-8">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-4">Network Settings</label>
                  <div className="space-y-4">
                    <div className="flex flex-col space-y-2">
                        <label className="text-xs text-gray-500 flex items-center"><GlobeIcon className="w-3.5 h-3.5 mr-2" /> Signaling Relay URL</label>
                        <div className="flex space-x-2">
                          <input type="text" value={relayUrl} onChange={e => setRelayUrl(e.target.value)} className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-xs font-mono" placeholder="wss://..." />
                          <button onClick={updateRelay} className="bg-white/10 hover:bg-white/20 px-4 rounded-xl text-xs font-bold transition-all">Update</button>
                        </div>
                        <p className="text-[9px] text-gray-500 italic">Use ws://localhost:8080 for private local signaling testing.</p>
                    </div>
                  </div>
                </div>

                <div className="pt-4 flex flex-col space-y-3">
                    <button onClick={() => downloadKeyFile(keys)} className="w-full bg-green-600 hover:bg-green-700 transition-all text-white py-3.5 rounded-2xl font-bold flex items-center justify-center space-x-3 shadow-lg shadow-green-600/10">
                        <DownloadIcon className="w-5 h-5" />
                        <span>Export Backup File</span>
                    </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Security Docs Modal */}
      {showSecurityDocs && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-xl flex items-center justify-center p-4 z-50 animate-fade-in" onClick={() => setShowSecurityDocs(false)}>
              <div className="bg-slate-900 p-8 rounded-3xl border border-blue-500/30 max-w-xl w-full shadow-2xl space-y-6" onClick={e => e.stopPropagation()}>
                  <div className="flex items-center justify-between">
                      <h3 className="text-2xl font-bold flex items-center space-x-3 text-blue-400">
                          <ShieldCheckIcon className="w-8 h-8" />
                          <span>Identity Protocol</span>
                      </h3>
                      <button onClick={() => setShowSecurityDocs(false)} className="p-1 hover:bg-white/10 rounded-full"><PlusIcon className="w-6 h-6 rotate-45" /></button>
                  </div>
                  
                  <div className="space-y-6 text-gray-300 text-sm leading-relaxed overflow-y-auto max-h-[70vh] pr-2 custom-scrollbar">
                      <section className="space-y-2">
                          <h4 className="text-white font-bold flex items-center"><KeyIcon className="w-4 h-4 mr-2 text-blue-400" /> Keys as Identity</h4>
                          <p>When you joined, your browser generated a unique mathematical pair: a <strong>Public Key</strong> (your ID) and a <strong>Private Key</strong> (your secret signature tool). We do not use passwords; your identity is tied to these keys.</p>
                      </section>
                      
                      <section className="space-y-2">
                          <h4 className="text-white font-bold flex items-center"><ShieldIcon className="w-4 h-4 mr-2 text-purple-400" /> Digital Signatures</h4>
                          <p>Every message you send is bundled with a digital signature created by your Private Key. When a friend receives it, their browser uses your Public Key to mathematically prove that <em>only you</em> could have sent it and that it hasn't been modified.</p>
                      </section>

                      <section className="space-y-2">
                          <h4 className="text-white font-bold flex items-center"><HashIcon className="w-4 h-4 mr-2 text-green-400" /> Zero-Knowledge</h4>
                          <p>Since we don't have a central server storing your keys, we have "Zero-Knowledge" of your activity. If you lose your keys, your account is gone forever. <strong>Always export a backup!</strong></p>
                      </section>
                  </div>
              </div>
          </div>
      )}

      {/* Logout Warning Modal */}
      {showLogoutWarning && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fade-in">
              <div className="bg-slate-900 p-8 rounded-3xl border border-white/10 max-w-sm w-full shadow-2xl text-center">
                  <LogOutIcon className="w-12 h-12 text-red-400 mx-auto mb-4" />
                  <h3 className="text-xl font-bold mb-4">Log Out?</h3>
                  <p className="text-sm text-gray-400 mb-8 leading-relaxed">This will end your session. Make sure you have downloaded your keys, or you won't be able to log back in!</p>
                  <div className="flex flex-col space-y-3">
                      <button onClick={onStartOver} className="bg-red-600 hover:bg-red-700 transition-colors text-white py-4 rounded-2xl font-bold">End Session</button>
                      <button onClick={() => setShowLogoutWarning(false)} className="bg-white/10 hover:bg-white/20 transition-colors text-white py-4 rounded-2xl font-bold">Cancel</button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};

export default ChatHomePage;