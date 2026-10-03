import { API_BASE } from '../utils/api';
import React, { useState, useRef } from 'react';
import { 
  FolderOpen, 
  UploadCloud, 
  FileText, 
  Download, 
  Trash2, 
  Image, 
  File, 
  Loader2, 
  CheckCircle,
  Clock,
  User,
  Paperclip
} from 'lucide-react';
import { Socket } from 'socket.io-client';

interface Attachment {
  originalName: string;
  url: string;
  size: number;
  mimetype: string;
}

interface Message {
  id: string;
  text: string;
  system: boolean;
  user: { name: string; role: string } | null;
  attachment: Attachment | null;
  timestamp: string;
}

interface FileVaultProps {
  socket: Socket | null;
  teamId: string;
  user: { id: string; name: string; role: string } | null;
  messages: Message[];
}

export default function FileVault({ socket, teamId, user, messages }: FileVaultProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Filter messages to extract shared files
  const sharedFiles = messages
    .filter(m => m.attachment)
    .map(m => ({
      id: m.id,
      originalName: m.attachment!.originalName,
      url: m.attachment!.url,
      size: m.attachment!.size,
      mimetype: m.attachment!.mimetype,
      uploadedBy: m.user?.name || 'System',
      timestamp: m.timestamp
    }))
    .reverse(); // Most recent first

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`;
    return `${(bytes / 1073741824).toFixed(1)} GB`;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const handleUpload = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) return;

    // 500MB Limit check
    const limit500MB = 500 * 1024 * 1024;
    if (selectedFile.size > limit500MB) {
      alert('File size exceeds the 500MB limit! Please select a smaller file.');
      return;
    }

    setUploading(true);
    setUploadProgress(0);

    const formData = new FormData();
    formData.append('file', selectedFile);

    const token = localStorage.getItem('hackhub_token');
    const xhr = new XMLHttpRequest();

    xhr.open('POST', `${API_BASE}/api/uploads`, true);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);

    // Track upload progress in real-time
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const percent = Math.round((event.loaded / event.total) * 100);
        setUploadProgress(percent);
      }
    };

    xhr.onload = () => {
      if (xhr.status === 200) {
        try {
          const uploaded = JSON.parse(xhr.responseText);
          // Broadcast file upload as a chat message with attachment to trigger sync
          socket?.emit('chat-message', {
            teamId,
            userId: user?.id,
            text: `Uploaded file to File Vault: ${uploaded.originalName}`,
            attachment: {
              originalName: uploaded.originalName,
              url: uploaded.url,
              size: uploaded.size,
              mimetype: uploaded.mimetype
            }
          });
          setSelectedFile(null);
        } catch (err) {
          console.error('Failed to parse upload response', err);
        }
      } else {
        alert('File upload failed: ' + xhr.statusText);
      }
      setUploading(false);
    };

    xhr.onerror = () => {
      alert('Upload failed due to connection error.');
      setUploading(false);
    };

    xhr.send(formData);
  };

  return (
    <div className="grid grid-cols-12 gap-5 h-[80vh]">
      {/* Upload Panel */}
      <div className="col-span-4 glass-panel p-5 rounded-2xl border-slate-800 flex flex-col justify-between h-full bg-slate-950/20">
        <div className="flex flex-col gap-5">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-900">
            <UploadCloud className="h-4.5 w-4.5 text-indigo-400" />
            <h3 className="font-bold text-xs uppercase tracking-wider text-slate-300">Upload Center</h3>
          </div>

          <form onSubmit={handleUpload} className="flex flex-col gap-4">
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileChange} 
              className="hidden" 
            />

            <div 
              onClick={triggerFileInput}
              className={`border border-dashed rounded-2xl p-6 text-center cursor-pointer transition flex flex-col items-center justify-center gap-3 ${
                selectedFile 
                  ? 'border-indigo-500/50 bg-indigo-950/5' 
                  : 'border-slate-800 hover:border-slate-700 bg-slate-900/5'
              }`}
            >
              <Paperclip className={`h-8 w-8 ${selectedFile ? 'text-indigo-400' : 'text-slate-600'}`} />
              <div>
                <span className="text-xs font-bold text-slate-300 block">
                  {selectedFile ? selectedFile.name : 'Choose a file to share'}
                </span>
                <span className="text-[10px] text-slate-500 block mt-1">
                  {selectedFile ? formatFileSize(selectedFile.size) : 'Drag and drop or click here'}
                </span>
              </div>
            </div>

            <div className="text-[10px] text-slate-500 leading-relaxed p-2 bg-slate-900/10 rounded-xl border border-slate-900/20">
              💡 Maximum upload limit is <b>500 MB</b>. Shared files are accessible instantly by all active team workspace members.
            </div>

            {selectedFile && (
              <button
                type="submit"
                disabled={uploading}
                className="w-full glass-button text-xs py-2! flex items-center justify-center gap-1.5 shadow-lg"
              >
                {uploading ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Uploading ({uploadProgress}%)
                  </>
                ) : (
                  <>
                    <UploadCloud className="h-3.5 w-3.5" /> Start Upload
                  </>
                )}
              </button>
            )}
          </form>

          {uploading && (
            <div className="flex flex-col gap-2 mt-2">
              <div className="flex justify-between items-center text-[10px] text-slate-400">
                <span>Sending to server...</span>
                <span>{uploadProgress}%</span>
              </div>
              <div className="h-1.5 w-full bg-slate-900 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-indigo-500 rounded-full transition-all duration-150"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-slate-900 pt-4 text-[10px] text-slate-500">
          <FolderOpen className="h-3.5 w-3.5 text-indigo-400" />
          <span>Workspace Storage Active</span>
        </div>
      </div>

      {/* Files Display Viewer */}
      <section className="col-span-8 flex flex-col gap-4 h-full">
        {/* Header */}
        <div className="glass-panel px-4 py-3 rounded-2xl border-slate-800 flex items-center justify-between bg-slate-950/20">
          <div className="flex items-center gap-2">
            <FolderOpen className="h-4.5 w-4.5 text-indigo-400" />
            <span className="text-xs font-bold text-white">Workspace Shared Files</span>
          </div>
          <span className="text-[10px] bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded-full font-bold">
            {sharedFiles.length} shared
          </span>
        </div>

        {/* Files list */}
        <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-4 max-h-[65vh]">
          {sharedFiles.length === 0 ? (
            <div className="flex-1 border border-dashed border-slate-800 rounded-2xl flex flex-col items-center justify-center p-12 text-center gap-3">
              <FolderOpen className="h-10 w-10 text-slate-700 animate-pulse" />
              <div>
                <h4 className="text-xs font-bold text-slate-400">File Vault is Empty</h4>
                <p className="text-[10px] text-slate-600 max-w-[200px] mt-1 mx-auto leading-relaxed">
                  No files have been uploaded yet. Drop a file in the upload zone to make it available here.
                </p>
              </div>
            </div>
          ) : (
            sharedFiles.map((file) => (
              <div 
                key={file.id} 
                className="glass-panel p-4.5 rounded-2xl border-slate-800 bg-slate-950/10 hover:border-slate-700 transition flex flex-col md:flex-row gap-4 justify-between items-start md:items-center relative overflow-hidden"
              >
                {/* File Info */}
                <div className="flex items-start gap-3.5 flex-1 min-w-0">
                  <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl text-indigo-400 shrink-0 shadow-inner">
                    {file.mimetype.startsWith('image/') ? (
                      <Image className="h-5.5 w-5.5" />
                    ) : (
                      <FileText className="h-5.5 w-5.5" />
                    )}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <h4 className="text-xs font-bold text-slate-100 truncate mb-1" title={file.originalName}>
                      {file.originalName}
                    </h4>
                    
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[9px] text-slate-500 font-semibold uppercase tracking-wider">
                      <span>{formatFileSize(file.size)}</span>
                      <span>•</span>
                      <span className="flex items-center gap-1"><User className="h-3 w-3" /> {file.uploadedBy}</span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" /> 
                        {new Date(file.timestamp).toLocaleDateString()} {new Date(file.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Previews & Downloads container */}
                <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-end shrink-0 border-t md:border-t-0 border-slate-900 pt-3.5 md:pt-0">
                  {/* Photo/Video Previewer Panel */}
                  {(file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) && (
                    <div className="relative rounded-lg overflow-hidden border border-slate-800/80 bg-slate-950 w-24 h-16 shrink-0 flex items-center justify-center shadow-inner">
                      {file.mimetype.startsWith('image/') ? (
                        <img 
                          src={`${API_BASE}${file.url}`} 
                          alt="preview" 
                          className="w-full h-full object-cover" 
                        />
                      ) : (
                        <video 
                          src={`${API_BASE}${file.url}`} 
                          className="w-full h-full object-cover" 
                        />
                      )}
                    </div>
                  )}

                  <a
                    href={`${API_BASE}${file.url}`}
                    download={file.originalName}
                    target="_blank"
                    rel="noreferrer"
                    className="glass-button text-[10px] py-2! px-4! flex items-center gap-1.5 shadow-md hover:text-white"
                  >
                    <Download className="h-3.5 w-3.5" /> Download
                  </a>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
