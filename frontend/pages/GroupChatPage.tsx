import * as React from 'react';
import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ECDSAKeys, Group, GroupMessage, MessageFile, GroupUpdate } from '../types';
import { truncateKey, copyToClipboard, resizeImage } from '../utils/helpers';
import { signGroupMessage, verifyGroupMessage } from '../services/cryptoService';
import { 
    UsersIcon, PlusIcon, InfoIcon, SendIcon, ShieldIcon, KeyIcon, CopyIcon, CheckIcon, 
    ArrowLeftIcon, LogInIcon, ShieldCheckIcon, ShieldAlertIcon, PaperclipIcon, FileIcon, 
    CalendarIcon, BarChart3Icon, XCircleIcon, CameraIcon
} from '../components/Icons';

const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = e => reject(e);
    });
};

const GroupDp: React.FC<{ group: Group; sizeClass: string }> = ({ group, sizeClass }) => {
    if (group.displayPicture) return <img src={group.displayPicture} alt={group.name} className={`${sizeClass} rounded-full object-cover shadow-lg`} />;
    const colors = ['bg-purple-600', 'bg-blue-600', 'bg-green-600', 'bg-pink-600', 'bg-indigo-600'];
    const color = colors[group.name.length % colors.length];
    return <div className={`${sizeClass} ${color} rounded-full flex items-center justify-center font-bold text-white shadow-lg`}>{group.name[0].toUpperCase()}</div>;
};

const GroupMessageBubble: React.FC<{ message: GroupMessage; isMe: boolean }> = ({ message, isMe }) => {
    const [isVerified, setIsVerified] = useState<boolean | null>(null);

    useEffect(() => {
        let isMounted = true;
        verifyGroupMessage(message).then(res => {
            if (isMounted) setIsVerified(res);
        });
        return () => { isMounted = false; };
    }, [message]);

    return (
        <div className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} space-y-1`}>
            <div className={`p-3 rounded-2xl max-w-[85%] ${isMe ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white' : 'bg-white/10 text-white border border-white/5'}`}>
                {!isMe && <p className="text-[9px] text-blue-400 font-mono mb-1 uppercase tracking-tight">{truncateKey(message.senderKey, 8, 4)}</p>}
                <p className="text-sm leading-relaxed">{message.content}</p>
                <div className="flex items-center justify-end mt-1.5 pt-1.5 border-t border-white/10">
                    <div className="flex items-center space-x-1">
                        {isVerified === null ? (
                            <div className="w-2 h-2 bg-gray-500 rounded-full animate-pulse" />
                        ) : isVerified ? (
                            <ShieldCheckIcon className="w-3 h-3 text-green-400" title="Verified Signature" />
                        ) : (
                            <ShieldAlertIcon className="w-3 h-3 text-red-400" title="Invalid Signature" />
                        )}
                        <span className="text-[9px] text-gray-400 uppercase font-bold tracking-widest">{isVerified ? 'Verified' : 'Unverified'}</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

const GroupChatPage: React.FC<{ keys: ECDSAKeys }> = ({ keys }) => {
  const [currentView, setCurrentView] = useState<'groups' | 'create' | 'chat' | 'join'>('groups');
  const [groups, setGroups] = useState<Group[]>([]);
  const [activeGroup, setActiveGroup] = useState<Group | null>(null);
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [showGroupInfo, setShowGroupInfo] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupKeys, setNewGroupKeys] = useState('');
  const [joinInvitation, setJoinInvitation] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const saved = localStorage.getItem('secureChat_groups');
    if (saved) setGroups(JSON.parse(saved));
  }, []);

  useEffect(() => {
    if (activeGroup) {
      const saved = localStorage.getItem(`secureChat_group_messages_${activeGroup.id}`);
      if (saved) setMessages(JSON.parse(saved));
      else setMessages([]);
    }
  }, [activeGroup?.id]);

  const saveGroups = (updated: Group[]) => {
      setGroups(updated);
      localStorage.setItem('secureChat_groups', JSON.stringify(updated));
  };
  
  const saveMessages = (groupId: string, updated: GroupMessage[]) => {
      setMessages(updated);
      localStorage.setItem(`secureChat_group_messages_${groupId}`, JSON.stringify(updated));
  };

  const handleSendMessage = async () => {
      if (!newMessage.trim() || !activeGroup) return;
      const payload: Omit<GroupMessage, 'id' | 'signature'> = {
          groupId: activeGroup.id, senderKey: keys.publicKey, timestamp: Date.now(),
          type: 'text', content: newMessage.trim()
      };
      const signature = await signGroupMessage(payload, keys.privateKey);
      const msg: GroupMessage = { ...payload, id: Date.now(), signature };
      const updated = [...messages, msg];
      saveMessages(activeGroup.id, updated);
      setNewMessage('');
  };

  useEffect(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white flex flex-col font-sans">
        <header className="bg-black/20 backdrop-blur-md border-b border-white/10 p-4 sticky top-0 z-20">
            <div className="max-w-4xl mx-auto flex items-center justify-between">
                <div className="flex items-center space-x-3">
                    <button onClick={() => currentView === 'chat' ? setCurrentView('groups') : navigate('/home')} className="p-2 hover:bg-white/10 rounded-full transition-all hover:scale-110 active:scale-95"><ArrowLeftIcon className="w-5 h-5"/></button>
                    <div>
                        <h1 className="text-xl font-bold tracking-tight">{activeGroup && currentView === 'chat' ? activeGroup.name : 'Group Chats'}</h1>
                        {activeGroup && currentView === 'chat' && <p className="text-[10px] text-blue-400 font-bold uppercase tracking-widest">{activeGroup.memberKeys.length} Verified Members</p>}
                    </div>
                </div>
                {currentView === 'groups' && (
                  <div className="flex space-x-2">
                    <button onClick={() => setCurrentView('join')} className="bg-white/5 hover:bg-white/10 border border-white/10 px-4 py-1.5 rounded-xl text-sm font-bold transition-all">Join</button>
                    <button onClick={() => setCurrentView('create')} className="bg-blue-600 hover:bg-blue-700 px-4 py-1.5 rounded-xl text-sm font-bold transition-all shadow-lg shadow-blue-600/20">New Group</button>
                  </div>
                )}
            </div>
        </header>

        <main className="flex-1 max-w-4xl mx-auto w-full p-6 flex flex-col">
            {currentView === 'groups' && (
                <div className="space-y-4 animate-fade-in">
                  {groups.length === 0 ? (
                      <div className="text-center py-32 space-y-4">
                        <UsersIcon className="w-16 h-16 mx-auto opacity-10" />
                        <p className="text-gray-400">No multi-party chats yet.</p>
                      </div>
                  ) : groups.map(g => (
                    <button key={g.id} onClick={() => { setActiveGroup(g); setCurrentView('chat'); }} className="w-full bg-white/5 p-5 rounded-3xl flex items-center space-x-4 hover:bg-white/10 border border-white/5 transition-all group">
                      <GroupDp group={g} sizeClass="w-12 h-12" />
                      <div className="text-left flex-1">
                          <h3 className="font-bold group-hover:text-blue-400 transition-colors">{g.name}</h3>
                          <p className="text-xs text-gray-500">{g.memberKeys.length} signed identities</p>
                      </div>
                      <div className="p-2 bg-white/5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                          <ArrowLeftIcon className="w-4 h-4 rotate-180" />
                      </div>
                    </button>
                  ))}
                </div>
            )}

            {currentView === 'chat' && activeGroup && (
                <div className="flex flex-col h-full animate-fade-in">
                  <div className="flex-1 overflow-y-auto space-y-6 mb-6 pr-2 custom-scrollbar">
                    {messages.length === 0 && (
                        <div className="text-center py-12 text-gray-500 space-y-2">
                            <ShieldCheckIcon className="w-10 h-10 mx-auto opacity-10" />
                            <p className="text-xs uppercase tracking-widest font-bold">Secure Channel Established</p>
                        </div>
                    )}
                    {messages.map(m => (
                      <GroupMessageBubble key={m.id} message={m} isMe={m.senderKey === keys.publicKey} />
                    ))}
                    <div ref={messagesEndRef} />
                  </div>
                  <div className="flex space-x-2 bg-black/40 p-2.5 rounded-3xl border border-white/10 shadow-2xl items-end">
                    <textarea 
                        value={newMessage} 
                        onChange={e => setNewMessage(e.target.value)} 
                        onKeyPress={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSendMessage())} 
                        className="flex-1 bg-transparent px-4 py-2.5 outline-none resize-none text-sm min-h-[44px] max-h-32" 
                        placeholder="Type an encrypted message..." 
                        rows={1}
                    />
                    <button 
                        onClick={handleSendMessage} 
                        disabled={!newMessage.trim()}
                        className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 p-3 rounded-2xl transition-all shadow-lg shadow-blue-600/20 active:scale-90"
                    >
                        <SendIcon className="w-5 h-5"/>
                    </button>
                  </div>
                </div>
            )}

            {currentView === 'create' && (
              <div className="bg-white/5 p-8 rounded-3xl border border-white/10 space-y-8 animate-scale-up">
                <div className="space-y-2">
                    <h2 className="text-2xl font-bold">Create Group Identity</h2>
                    <p className="text-sm text-gray-400">Initialize a new multi-party signed chat channel.</p>
                </div>
                <div className="space-y-4">
                    <div>
                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-2">Channel Name</label>
                        <input value={newGroupName} onChange={e => setNewGroupName(e.target.value)} className="w-full bg-black/40 p-4 rounded-2xl border border-white/5 focus:border-blue-500/50 outline-none transition-colors" placeholder="Project Alpha" />
                    </div>
                    <div>
                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-2">Member Public Keys (One per line)</label>
                        <textarea value={newGroupKeys} onChange={e => setNewGroupKeys(e.target.value)} className="w-full bg-black/40 p-4 rounded-2xl border border-white/5 focus:border-blue-500/50 outline-none transition-colors h-40 font-mono text-xs" placeholder="Paste Public Keys here..." />
                    </div>
                </div>
                <div className="flex space-x-3">
                    <button onClick={() => setCurrentView('groups')} className="flex-1 bg-white/5 hover:bg-white/10 py-4 rounded-2xl font-bold transition-all">Cancel</button>
                    <button onClick={() => {
                        if (!newGroupName.trim()) return alert("Group name is required");
                        const mKeys = newGroupKeys.split('\n').map(k => k.trim()).filter(k => k);
                        const group = { id: Date.now().toString(), name: newGroupName.trim(), memberKeys: [keys.publicKey, ...mKeys] };
                        saveGroups([...groups, group]);
                        setCurrentView('groups');
                    }} className="flex-[2] bg-blue-600 hover:bg-blue-700 py-4 rounded-2xl font-bold transition-all shadow-lg shadow-blue-600/20">Initialize Channel</button>
                </div>
              </div>
            )}
        </main>
    </div>
  );
};

export default GroupChatPage;