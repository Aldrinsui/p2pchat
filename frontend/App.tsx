import * as React from 'react';
import { useState, useCallback, useEffect } from 'react';
import { Routes, Route, useNavigate, Navigate } from 'react-router-dom';
import type { ECDSAKeys, Message, Contact } from './types';
import WelcomePage from './pages/WelcomePage';
import KeyManagementPage from './pages/KeyManagementPage';
import ChatHomePage from './pages/ChatHomePage';
import ChatPage from './pages/ChatPage';
import QrExchangePage from './pages/QrExchangePage';
import GroupChatPage from './pages/GroupChatPage';
import { webrtcService } from './services/webrtcService';
import { verify } from './services/cryptoService';

const getKeysFromSession = (): ECDSAKeys | null => {
    const publicKey = sessionStorage.getItem('userPublicKey');
    const privateKey = sessionStorage.getItem('userPrivateKey');
    const timestamp = sessionStorage.getItem('userKeyTimestamp');
    if (publicKey && privateKey && timestamp) {
        return { publicKey, privateKey, timestamp };
    }
    return null;
};

function App(): React.ReactNode {
    const [keys, setKeys] = useState<ECDSAKeys | null>(getKeysFromSession());
    const navigate = useNavigate();

    // Global listener for incoming P2P messages
    const handleIncomingMessage = useCallback(async (fromKey: string, payloadStr: string) => {
        try {
            const incomingMsg = JSON.parse(payloadStr) as Message;
            const contacts: Contact[] = JSON.parse(localStorage.getItem('secureChat_contacts') || '[]');
            const sender = contacts.find(c => c.publicKey === fromKey);

            if (sender) {
                // Verify the signature before accepting the message
                const isValid = await verify(incomingMsg, fromKey);
                if (isValid) {
                    const storageKey = `messages_${sender.id}`;
                    const history: Message[] = JSON.parse(localStorage.getItem(storageKey) || '[]');
                    
                    // Prevent duplicates
                    if (!history.some(m => m.timestamp === incomingMsg.timestamp)) {
                        const updated = [...history, { ...incomingMsg, sender: 'them', state: 'received' as const }];
                        localStorage.setItem(storageKey, JSON.stringify(updated));
                        // Dispatch custom event to notify active ChatPage
                        window.dispatchEvent(new CustomEvent('newP2PMessage', { detail: { contactId: sender.id } }));
                    }
                } else {
                    console.error("Received message with invalid signature from", fromKey);
                }
            }
        } catch (e) {
            console.error("Failed to process incoming P2P message", e);
        }
    }, []);

    useEffect(() => {
        if (keys) {
            webrtcService.init(keys.publicKey, handleIncomingMessage);
        }
        return () => {
          webrtcService.cleanup();
        };
    }, [keys, handleIncomingMessage]);

    const handleKeysGenerated = useCallback((generatedKeys: ECDSAKeys) => {
        sessionStorage.setItem('userPublicKey', generatedKeys.publicKey);
        sessionStorage.setItem('userPrivateKey', generatedKeys.privateKey);
        sessionStorage.setItem('userKeyTimestamp', generatedKeys.timestamp);
        setKeys(generatedKeys);
        navigate('/keys');
    }, [navigate]);
    
    const handleLogout = useCallback(() => {
        webrtcService.cleanup();
        sessionStorage.removeItem('userPublicKey');
        sessionStorage.removeItem('userPrivateKey');
        sessionStorage.removeItem('userKeyTimestamp');
        setKeys(null);
        navigate('/', { replace: true });
    }, [navigate]);

    const handleStartOver = useCallback(() => {
        webrtcService.cleanup();
        sessionStorage.clear();
        localStorage.clear();
        setKeys(null);
        navigate('/', { replace: true });
    }, [navigate]);

    return (
        <Routes>
            <Route path="/" element={!keys ? <WelcomePage onKeysGenerated={handleKeysGenerated} /> : <Navigate to="/home" replace />} />
            <Route path="/keys" element={keys ? <KeyManagementPage keys={keys} onStartOver={handleStartOver} /> : <Navigate to="/" replace />} />
            <Route path="/home" element={keys ? <ChatHomePage keys={keys} onStartOver={handleLogout} /> : <Navigate to="/" replace />} />
            <Route path="/chat/:contactId" element={keys ? <ChatPage keys={keys} /> : <Navigate to="/" replace />} />
            <Route path="/qr" element={keys ? <QrExchangePage keys={keys} /> : <Navigate to="/" replace />} />
            <Route path="/groups" element={keys ? <GroupChatPage keys={keys} /> : <Navigate to="/" replace />} />
            <Route path="*" element={<Navigate to={keys ? "/home" : "/"} replace />} />
        </Routes>
    );
}

export default App;