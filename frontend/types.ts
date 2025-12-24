export interface ECDSAKeys {
  publicKey: string;
  privateKey: string;
  timestamp: string;
}

export enum AlertType {
    WARNING = 'warning',
    CRITICAL = 'critical',
}

export interface Contact {
  id: number;
  publicKey: string;
  nickname: string;
  addedAt: string;
}

export interface MessageFile {
    name: string;
    type: string;
    size: number;
    data: string; // Base64 encoded file content
}

export interface Message {
  id: number;
  contactId: number;
  sender: 'you' | 'them';
  content: string;
  file?: MessageFile;
  signature: string;
  timestamp: number;
  state: 'sent' | 'sending' | 'failed' | 'received';
}

export interface Group {
  id: string;
  name: string;
  memberKeys: string[];
  displayPicture?: string;
}

export interface GroupPoll {
    question: string;
    options: string[];
}

export interface GroupEvent {
    title: string;
    description: string;
    location?: string;
    eventTime: string;
}

export interface GroupPollVote {
    pollId: number;
    optionIndex: number;
}

export interface GroupUpdate {
    displayPicture: string;
}

export interface GroupMessage {
    id: number;
    groupId: string;
    senderKey: string;
    timestamp: number;
    signature: string;
    type: 'text' | 'file' | 'event' | 'poll' | 'pollVote' | 'group_update';
    content: string;
    file?: MessageFile;
    poll?: GroupPoll;
    event?: GroupEvent;
    pollVote?: GroupPollVote;
    groupUpdate?: GroupUpdate;
}