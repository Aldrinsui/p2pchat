import type { ECDSAKeys, Message, GroupMessage } from '../types';

const textEncoder = new TextEncoder();

const bufferToHex = (buffer: ArrayBuffer): string => {
    return Array.from(new Uint8Array(buffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
};

const hexToBuffer = (hex: string): ArrayBuffer => {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
    }
    return bytes.buffer;
};

export const generateAndExportKeys = async (): Promise<ECDSAKeys> => {
    const keyPair = await window.crypto.subtle.generateKey(
        { name: "ECDSA", namedCurve: "P-256" },
        true,
        ["sign", "verify"]
    );

    const [publicKeyBuffer, privateKeyBuffer] = await Promise.all([
        window.crypto.subtle.exportKey("spki", keyPair.publicKey),
        window.crypto.subtle.exportKey("pkcs8", keyPair.privateKey)
    ]);

    return {
        publicKey: bufferToHex(publicKeyBuffer),
        privateKey: bufferToHex(privateKeyBuffer),
        timestamp: new Date().toISOString()
    };
};

const importPublicKey = (hex: string): Promise<CryptoKey> => {
    const buffer = hexToBuffer(hex);
    return window.crypto.subtle.importKey('spki', buffer, { name: 'ECDSA', namedCurve: 'P-256' }, true, ['verify']);
};

const importPrivateKey = (hex: string): Promise<CryptoKey> => {
    const buffer = hexToBuffer(hex);
    return window.crypto.subtle.importKey('pkcs8', buffer, { name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']);
};

const getCanonicalMessagePayload = (message: Omit<Message, 'id' | 'signature' | 'state'>): string => {
    const payload = {
        contactId: message.contactId,
        sender: message.sender,
        content: message.content,
        timestamp: message.timestamp,
        file: message.file ? {
            name: message.file.name,
            type: message.file.type,
            size: message.file.size,
        } : undefined,
    };
    return JSON.stringify(payload);
};


export const sign = async (messagePayload: Omit<Message, 'id' | 'signature' | 'state'>, privateKeyHex: string): Promise<string> => {
    try {
        const privateKey = await importPrivateKey(privateKeyHex);
        const canonicalPayload = getCanonicalMessagePayload(messagePayload);
        const signatureBuffer = await window.crypto.subtle.sign(
            { name: 'ECDSA', hash: 'SHA-256' },
            privateKey,
            textEncoder.encode(canonicalPayload)
        );
        const sig = bufferToHex(signatureBuffer);
        console.log('%c[CRYPTO] Message signed successfully.', 'color: #db2777');
        return sig;
    } catch (err) {
        console.error('[CRYPTO] Signing failed:', err);
        throw err;
    }
};

export const verify = async (message: Message, publicKeyHex: string): Promise<boolean> => {
    try {
        const publicKey = await importPublicKey(publicKeyHex);
        const signature = hexToBuffer(message.signature);
        const canonicalPayload = getCanonicalMessagePayload(message);
        const isValid = await window.crypto.subtle.verify(
            { name: 'ECDSA', hash: 'SHA-256' },
            publicKey,
            signature,
            textEncoder.encode(canonicalPayload)
        );
        
        if (isValid) {
            console.log('%c[CRYPTO] Signature verification: SUCCESS', 'color: #059669; font-weight: bold');
        } else {
            console.warn('%c[CRYPTO] Signature verification: FAILED (Invalid signature)', 'color: #dc2626; font-weight: bold');
        }
        return isValid;
    } catch (e) {
        console.error("[CRYPTO] Verification error:", e);
        return false;
    }
};

export const generateFingerprint = async (publicKeyHex: string): Promise<string> => {
    const publicKeyBuffer = textEncoder.encode(publicKeyHex);
    const hashBuffer = await crypto.subtle.digest('SHA-256', publicKeyBuffer);
    return bufferToHex(hashBuffer).substring(0, 16).toUpperCase();
};

const getCanonicalGroupMessagePayload = (message: Omit<GroupMessage, 'id' | 'signature'>): string => {
    const payload = {
        groupId: message.groupId,
        senderKey: message.senderKey,
        timestamp: message.timestamp,
        type: message.type,
        content: message.content,
        file: message.file ? {
            name: message.file.name,
            type: message.file.type,
            size: message.file.size,
        } : undefined,
        event: message.event ? {
            title: message.event.title,
            description: message.event.description,
            location: message.event.location,
            eventTime: message.event.eventTime,
        } : undefined,
        poll: message.poll ? {
            question: message.poll.question,
            options: message.poll.options,
        } : undefined,
        pollVote: message.pollVote ? {
            pollId: message.pollVote.pollId,
            optionIndex: message.pollVote.optionIndex,
        } : undefined,
        groupUpdate: message.groupUpdate ? {
            displayPicture: message.groupUpdate.displayPicture,
        } : undefined,
    };
    return JSON.stringify(payload);
};

export const signGroupMessage = async (messagePayload: Omit<GroupMessage, 'id' | 'signature'>, privateKeyHex: string): Promise<string> => {
    const privateKey = await importPrivateKey(privateKeyHex);
    const canonicalPayload = getCanonicalGroupMessagePayload(messagePayload);
    const signatureBuffer = await window.crypto.subtle.sign(
        { name: 'ECDSA', hash: 'SHA-256' },
        privateKey,
        textEncoder.encode(canonicalPayload)
    );
    return bufferToHex(signatureBuffer);
};

export const verifyGroupMessage = async (message: GroupMessage): Promise<boolean> => {
    try {
        const publicKey = await importPublicKey(message.senderKey);
        const signature = hexToBuffer(message.signature);
        const canonicalPayload = getCanonicalGroupMessagePayload(message);
        const isValid = await window.crypto.subtle.verify(
            { name: 'ECDSA', hash: 'SHA-256' },
            publicKey,
            signature,
            textEncoder.encode(canonicalPayload)
        );
        console.log(`[CRYPTO] Group verification result: ${isValid}`);
        return isValid;
    } catch (e) {
        console.error("Group message verification failed:", e);
        return false;
    }
};

export const downloadKeyFile = (keys: ECDSAKeys): void => {
    const keyData = {
        privateKey: keys.privateKey,
        publicKey: keys.publicKey,
        generated: keys.timestamp,
        curve: "ECDSA P-256",
        warning: "CRITICAL: Keep this private key secure."
    };

    const blob = new Blob([JSON.stringify(keyData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `securechat-keys-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};