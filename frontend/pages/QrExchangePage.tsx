import * as React from 'react';
import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { QRCodeCanvas } from 'qrcode.react';
import jsQR from 'jsqr';
import type { ECDSAKeys, Contact } from '../types';
import { AlertType } from '../types';
import Layout from '../components/Layout';
import Alert from '../components/Alert';
import { truncateKey, copyToClipboard } from '../utils/helpers';
import { 
  QrCodeIcon, CameraIcon, CopyIcon, CheckIcon, UsersIcon, 
  XIcon, FingerprintIcon, ArrowLeftIcon, ShieldCheckIcon 
} from '../components/Icons';

type View = 'my-qr' | 'scan' | 'confirm';

const QrExchangePage: React.FC<{ keys: ECDSAKeys }> = ({ keys }) => {
    const navigate = useNavigate();
    const [currentView, setCurrentView] = useState<View>('my-qr');
    const [copied, setCopied] = useState(false);
    const [cameraPermission, setCameraPermission] = useState<'granted' | 'denied' | 'prompt'>('prompt');
    const [scannedKey, setScannedKey] = useState('');
    const [contacts, setContacts] = useState<Contact[]>([]);

    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const animationFrameId = useRef<number | null>(null);

    useEffect(() => {
        try {
            const savedContacts = localStorage.getItem('secureChat_contacts');
            if (savedContacts) setContacts(JSON.parse(savedContacts));
        } catch (error) {
            console.error("Failed to parse contacts from localStorage", error);
        }
    }, []);

    const handleCopyToClipboard = async (text: string) => {
        if (await copyToClipboard(text)) {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    const stopScan = useCallback(() => {
        if (animationFrameId.current) {
            cancelAnimationFrame(animationFrameId.current);
            animationFrameId.current = null;
        }
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
        if (videoRef.current) {
            videoRef.current.srcObject = null;
        }
    }, []);

    const scanFrame = useCallback(() => {
        if (!videoRef.current || !canvasRef.current || videoRef.current.readyState !== videoRef.current.HAVE_ENOUGH_DATA) {
            animationFrameId.current = requestAnimationFrame(scanFrame);
            return;
        }
        
        const canvas = canvasRef.current;
        const video = videoRef.current;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        
        if (context) {
            canvas.height = video.videoHeight;
            canvas.width = video.videoWidth;
            context.drawImage(video, 0, 0, canvas.width, canvas.height);
            const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
            
            // Safety check for jsQR dependency load
            const scan = (jsQR as any).default || jsQR;
            if (typeof scan !== 'function') {
                console.error("jsQR library not available or not a function");
                return;
            }

            const code = scan(imageData.data, imageData.width, imageData.height, { inversionAttempts: "dontInvert" });

            if (code) {
                setScannedKey(code.data);
                setCurrentView('confirm');
                stopScan();
            }
        }
        if (currentView === 'scan') {
            animationFrameId.current = requestAnimationFrame(scanFrame);
        }
    }, [stopScan, currentView]);

    const startScan = useCallback(async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
            streamRef.current = stream;
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                videoRef.current.onloadedmetadata = () => {
                    videoRef.current?.play().catch(console.error);
                    animationFrameId.current = requestAnimationFrame(scanFrame);
                };
            }
            setCameraPermission('granted');
        } catch (err) {
            console.error("Camera error:", err);
            setCameraPermission('denied');
        }
    }, [scanFrame]);
    
    useEffect(() => {
      if (currentView === 'scan' && cameraPermission !== 'denied') {
          startScan();
      }
      return () => stopScan();
    }, [currentView, startScan, stopScan, cameraPermission]);


    const handleAddContact = () => {
        const isDuplicate = contacts.some(contact => contact.publicKey === scannedKey);
        if (isDuplicate) {
            navigate('/home');
            return;
        }
        const newContact: Contact = {
            id: Date.now(),
            publicKey: scannedKey,
            nickname: `Contact #${contacts.length + 1}`,
            addedAt: new Date().toISOString()
        };
        const updatedContacts = [...contacts, newContact];
        localStorage.setItem('secureChat_contacts', JSON.stringify(updatedContacts));
        navigate('/home');
    };

    const isScannedKeyDuplicate = contacts.some(c => c.publicKey === scannedKey);

    const renderMyQr = () => (
        <div className="max-w-md w-full bg-white/10 backdrop-blur-md rounded-3xl p-8 border border-white/20 shadow-2xl animate-fade-in text-center">
            <div className="flex items-center mb-8">
                <button onClick={() => navigate('/home')} className="p-2 -ml-2 mr-2 hover:bg-white/10 rounded-full transition-all"><ArrowLeftIcon className="w-5 h-5"/></button>
                <h1 className="text-xl font-bold flex items-center tracking-tight"><QrCodeIcon className="w-6 h-6 mr-3 text-blue-400"/>My Identity QR</h1>
            </div>
            <div className="p-6 bg-white rounded-3xl mb-8 inline-block shadow-xl shadow-black/40 border border-white/20"><QRCodeCanvas value={keys.publicKey} size={256} bgColor={"#ffffff"} fgColor={"#000000"} /></div>
            <div className="bg-black/40 rounded-2xl p-4 border border-white/5 mb-8">
                <p className="text-[10px] text-gray-500 uppercase font-bold tracking-widest mb-3">Your Public Identity</p>
                <p className="text-[11px] text-gray-400 font-mono break-all mb-4 leading-relaxed px-2">{keys.publicKey}</p>
                <button onClick={() => handleCopyToClipboard(keys.publicKey)} className="w-full bg-blue-600/20 hover:bg-blue-600 text-blue-400 hover:text-white rounded-xl py-3 px-4 flex items-center justify-center space-x-2 transition-all border border-blue-600/30 hover:border-transparent font-bold">
                    {copied ? <CheckIcon className="w-5 h-5" /> : <CopyIcon className="w-5 h-5" />}
                    <span>{copied ? 'Copied to Clipboard' : 'Copy Key String'}</span>
                </button>
            </div>
            <button onClick={() => setCurrentView('scan')} className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:opacity-90 text-white font-bold py-4 px-6 rounded-2xl transition-all shadow-lg shadow-purple-600/20 flex items-center justify-center space-x-3 transform active:scale-95">
                <CameraIcon className="w-5 h-5" /><span>Scan Contact QR</span>
            </button>
        </div>
    );
    
    const renderScan = () => (
        <div className="max-w-md w-full bg-white/10 backdrop-blur-md rounded-3xl p-8 border border-white/20 shadow-2xl animate-fade-in">
             <div className="flex items-center mb-8">
                <button onClick={() => { stopScan(); setCurrentView('my-qr'); }} className="p-2 -ml-2 mr-2 hover:bg-white/10 rounded-full transition-all"><ArrowLeftIcon className="w-5 h-5"/></button>
                <h1 className="text-xl font-bold flex items-center tracking-tight"><CameraIcon className="w-6 h-6 mr-3 text-blue-400"/>Scan New Peer</h1>
            </div>
            <div className="aspect-square bg-black rounded-2xl overflow-hidden relative flex items-center justify-center shadow-2xl border border-white/10">
                {cameraPermission === 'granted' && <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />}
                <canvas ref={canvasRef} className="hidden" />
                <div className="absolute inset-0 border-[60px] border-black/60"></div>
                <div className="absolute w-3/4 h-3/4 border-2 border-white/40 rounded-3xl animate-pulse"></div>
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-black/60 backdrop-blur-md px-4 py-2 rounded-full border border-white/10">
                    <p className="text-[10px] text-white font-bold uppercase tracking-widest">Scanning for Public Key...</p>
                </div>
            </div>
            {cameraPermission === 'denied' && (
                 <div className="mt-8">
                    <Alert type={AlertType.CRITICAL} title="Camera Locked">
                        To add peers via QR, please enable camera access in your browser security settings.
                    </Alert>
                </div>
            )}
        </div>
    );
    
    const renderConfirm = () => (
        <div className="max-w-md w-full bg-white/10 backdrop-blur-md rounded-3xl p-8 border border-white/20 shadow-2xl animate-scale-up">
            <div className="flex items-center justify-between mb-8">
                <h1 className="text-xl font-bold flex items-center tracking-tight"><UsersIcon className="w-6 h-6 mr-3 text-blue-400"/>Verify Identity</h1>
                <button onClick={() => setCurrentView('scan')} className="p-2 hover:bg-white/10 rounded-full transition-colors"><XIcon className="w-5 h-5"/></button>
            </div>
            <div className="bg-black/40 rounded-2xl p-5 border border-white/10 mb-8">
                <div className="flex items-center space-x-2 mb-3">
                    <FingerprintIcon className="w-4 h-4 text-purple-400" />
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Scanned Fingerprint</h3>
                </div>
                <p className="text-[11px] font-mono text-blue-400 break-all leading-relaxed">{truncateKey(scannedKey, 16, 16)}</p>
            </div>
            {isScannedKeyDuplicate ? (
                <div className="mb-8"><Alert type={AlertType.WARNING} title="Existing Connection">This peer is already in your verified contacts list.</Alert></div>
            ) : (
                <div className="space-y-4 mb-8">
                    <div className="flex items-start space-x-3 text-xs text-gray-400 bg-white/5 p-4 rounded-xl border border-white/5 leading-relaxed">
                        <ShieldCheckIcon className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
                        <p>Adding this contact will enable <strong>ECDSA-signed</strong> message verification for every message you receive from them.</p>
                    </div>
                </div>
            )}
             <div className="flex space-x-3">
                <button onClick={() => setCurrentView('scan')} className="flex-1 bg-white/5 hover:bg-white/10 text-white font-bold py-4 rounded-2xl transition-all border border-white/10">Back</button>
                <button onClick={handleAddContact} className="flex-[2] bg-gradient-to-r from-blue-600 to-indigo-600 hover:opacity-90 text-white font-bold py-4 rounded-2xl transition-all shadow-lg shadow-blue-600/20 active:scale-95">
                    {isScannedKeyDuplicate ? 'Done' : 'Verify & Add Peer'}
                </button>
            </div>
        </div>
    );

    return (
        <Layout>
            {currentView === 'my-qr' && renderMyQr()}
            {currentView === 'scan' && renderScan()}
            {currentView === 'confirm' && renderConfirm()}
        </Layout>
    );
};

export default QrExchangePage;