import * as React from 'react';
import { useState, useCallback, useRef } from 'react';
import { ShieldIcon, KeyIcon, DownloadIcon, LogInIcon, InfoIcon, ShieldCheckIcon } from '../components/Icons';
import Layout from '../components/Layout';
import Alert from '../components/Alert';
import { generateAndExportKeys } from '../services/cryptoService';
import type { ECDSAKeys } from '../types';
import { AlertType } from '../types';

interface WelcomePageProps {
    onKeysGenerated: (keys: ECDSAKeys) => void;
}

const WelcomePage: React.FC<WelcomePageProps> = ({ onKeysGenerated }) => {
    const [mode, setMode] = useState<'generate' | 'import'>('generate');
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [importJson, setImportJson] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleGenerateClick = useCallback(async () => {
        setIsProcessing(true);
        setError(null);
        try {
            const keys = await generateAndExportKeys();
            onKeysGenerated(keys);
        } catch (err) {
            setError('Key generation failed. Browser crypto support missing.');
        } finally {
            setIsProcessing(false);
        }
    }, [onKeysGenerated]);

    const validateAndLogin = (jsonString: string) => {
        setError(null);
        try {
            const data = JSON.parse(jsonString);
            if (!data.publicKey || !data.privateKey) throw new Error("Missing keys.");
            onKeysGenerated({
                publicKey: data.publicKey,
                privateKey: data.privateKey,
                timestamp: data.generated || new Date().toISOString()
            });
        } catch (err) {
            setError("Invalid key JSON. Use a file exported from SecureChat.");
        }
    };

    return (
        <Layout>
            <div className="max-w-md w-full bg-white/10 backdrop-blur-md rounded-2xl p-8 border border-white/20 shadow-2xl animate-fade-in">
                <div className="text-center">
                    <div className="mx-auto w-16 h-16 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center mb-6 shadow-lg shadow-blue-500/20">
                        <ShieldIcon className="w-8 h-8 text-white" />
                    </div>
                    <h1 className="text-3xl font-bold text-white mb-2">SecureChat</h1>
                    <p className="text-gray-400 mb-8 text-sm uppercase tracking-widest font-bold">Client-Side Encryption</p>

                    <div className="flex bg-black/30 p-1 rounded-xl mb-8 border border-white/5">
                        <button onClick={() => setMode('generate')} className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all ${mode === 'generate' ? 'bg-white/10 text-white shadow-inner' : 'text-gray-400 hover:text-gray-200'}`}>New Identity</button>
                        <button onClick={() => setMode('import')} className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all ${mode === 'import' ? 'bg-white/10 text-white shadow-inner' : 'text-gray-400 hover:text-gray-200'}`}>Log In</button>
                    </div>

                    {error && <div className="mb-6"><Alert type={AlertType.CRITICAL} title="Error">{error}</Alert></div>}

                    {mode === 'generate' ? (
                        <div className="space-y-6">
                            <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 text-left space-y-3">
                                <h3 className="text-blue-300 text-xs font-bold uppercase tracking-widest flex items-center">
                                    <ShieldCheckIcon className="w-4 h-4 mr-2" />
                                    Security Protocol
                                </h3>
                                <p className="text-gray-300 text-xs leading-relaxed">
                                    This app generates an <strong>ECDSA P-256</strong> key pair locally. 
                                    Your "Username" is a Public Key. Your "Password" is a Private Key.
                                    <strong> We never store your keys on a server.</strong>
                                </p>
                            </div>
                            <button onClick={handleGenerateClick} disabled={isProcessing} className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:opacity-90 disabled:opacity-50 text-white font-bold py-4 rounded-xl transition-all flex items-center justify-center space-x-3 shadow-lg shadow-blue-600/20">
                                {isProcessing ? <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div> : <KeyIcon className="w-5 h-5" />}
                                <span>{isProcessing ? 'Generating...' : 'Create My Keys'}</span>
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            <input type="file" ref={fileInputRef} onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                    const reader = new FileReader();
                                    reader.onload = (ev) => validateAndLogin(ev.target?.result as string);
                                    reader.readAsText(file);
                                }
                            }} className="hidden" accept=".json" />
                            <button onClick={() => fileInputRef.current?.click()} className="w-full bg-white/5 hover:bg-white/10 border border-white/10 text-white font-medium py-4 rounded-xl transition-all flex items-center justify-center space-x-3">
                                <DownloadIcon className="w-5 h-5 text-gray-400" />
                                <span>Upload Key JSON</span>
                            </button>
                            <div className="relative">
                                <textarea value={importJson} onChange={(e) => setImportJson(e.target.value)} placeholder='Or paste raw JSON keys here...' className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-xs font-mono text-gray-300 h-24 focus:outline-none focus:border-blue-500/50 transition-colors" />
                            </div>
                            <button onClick={() => validateAndLogin(importJson)} disabled={!importJson.trim()} className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-3 rounded-xl flex items-center justify-center space-x-2 transition-all">
                                <LogInIcon className="w-5 h-5" />
                                <span>Log In</span>
                            </button>
                        </div>
                    )}

                    <div className="mt-8 flex items-center justify-center space-x-2 text-gray-500">
                        <InfoIcon className="w-4 h-4" />
                        <span className="text-[10px] uppercase font-bold tracking-widest">End-to-End Signed & Local Only</span>
                    </div>
                </div>
            </div>
        </Layout>
    );
};

export default WelcomePage;