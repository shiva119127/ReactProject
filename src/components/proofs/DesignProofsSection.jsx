import React, { useState, useEffect, useRef } from 'react';
import {
  Upload,
  FileText,
  Image as ImageIcon,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  X,
  Loader2,
  Layers,
  Sparkles,
  Plus,
  Eye,
} from 'lucide-react';
import Button from '../ui/Button';
import {
  getProofVersions,
  uploadProofVersion,
  validateProofFile,
  getSignedProofUrl,
} from '../../services/jobs';
import { useAuth } from '../../context/useAuth';

function formatFileSize(bytes) {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export default function DesignProofsSection({ jobId, ownerId }) {
  const { user } = useAuth();
  const [proofs, setProofs] = useState([]);
  const [loading, setLoading] = useState(Boolean(jobId));
  const [loadError, setLoadError] = useState(null);

  // Upload form state
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileValidationError, setFileValidationError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  // View state (for signed URL generation)
  const [viewingId, setViewingId] = useState(null);
  const [viewError, setViewError] = useState('');

  // Fetch existing proof versions
  const loadProofs = React.useCallback(async () => {
    if (!jobId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const data = await getProofVersions(jobId);
      setProofs(data);
    } catch (err) {
      setLoadError(err.message || 'Failed to load proof versions.');
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    let ignore = false;
    if (!jobId) return;

    getProofVersions(jobId)
      .then((data) => {
        if (!ignore) {
          setProofs(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!ignore) {
          setLoadError(err.message || 'Failed to load proof versions.');
          setLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [jobId]);


  // Handle file selection
  const handleFileSelect = (file) => {
    setFileValidationError('');
    setUploadError('');
    setUploadSuccess('');

    if (!file) {
      setSelectedFile(null);
      return;
    }

    const validation = validateProofFile(file);
    if (!validation.valid) {
      setFileValidationError(validation.error);
      setSelectedFile(null);
      return;
    }

    setSelectedFile(file);
  };

  const handleInputChange = (e) => {
    const file = e.target.files?.[0];
    handleFileSelect(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    handleFileSelect(file);
  };

  const handleClearSelectedFile = () => {
    setSelectedFile(null);
    setFileValidationError('');
    setUploadError('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Perform upload
  const handleUploadSubmit = async (e) => {
    e.preventDefault();
    if (!selectedFile) {
      setFileValidationError('Please select a file to upload.');
      return;
    }

    if (!user || user.id !== ownerId) {
      setUploadError('Authentication required: only the job owner can upload proof files.');
      return;
    }

    setUploading(true);
    setUploadError('');
    setUploadSuccess('');

    try {
      const newVersion = await uploadProofVersion({
        jobId,
        ownerId,
        file: selectedFile,
      });

      setUploadSuccess(
        `Version ${newVersion.version_number} uploaded successfully (${selectedFile.name}).`
      );
      handleClearSelectedFile();
      setIsUploadOpen(false);

      // Refresh proof list from database
      await loadProofs();
    } catch (err) {
      setUploadError(err.message || 'Failed to upload proof. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  // View proof securely with signed URL
  const handleViewProof = async (proof) => {
    setViewingId(proof.id);
    setViewError('');

    try {
      const signedUrl = await getSignedProofUrl(proof.storage_path, 3600);
      if (signedUrl) {
        // Open safely in a new tab
        window.open(signedUrl, '_blank', 'noopener,noreferrer');
      } else {
        throw new Error('Unable to generate secure viewing link.');
      }
    } catch (err) {
      setViewError(`Failed to view proof: ${err.message}`);
    } finally {
      setViewingId(null);
    }
  };

  return (
    <section
      aria-labelledby="design-proofs-heading"
      className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-6 space-y-6"
    >
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <h2
              id="design-proofs-heading"
              className="text-lg font-bold text-slate-900 tracking-tight"
            >
              Design Proofs
            </h2>
            <p className="text-xs text-slate-500">
              Manage artwork proofs, revision versions, and client-ready print files.
            </p>
          </div>
        </div>

        {proofs.length > 0 && !isUploadOpen && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            icon={Plus}
            onClick={() => {
              setIsUploadOpen(true);
              setUploadSuccess('');
              setUploadError('');
            }}
            id="upload-new-version-btn"
          >
            Upload New Version
          </Button>
        )}
      </div>

      {/* Global Status/Error Notifications */}
      {loadError && (
        <div
          role="alert"
          className="p-4 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-3"
        >
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          <span>{loadError}</span>
        </div>
      )}

      {uploadSuccess && (
        <div
          role="status"
          className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-3 animate-in fade-in"
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span className="font-medium">{uploadSuccess}</span>
        </div>
      )}

      {viewError && (
        <div
          role="alert"
          className="p-4 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-3"
        >
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          <span>{viewError}</span>
        </div>
      )}

      {/* Upload Drawer / Panel */}
      {isUploadOpen && (
        <div className="bg-slate-50/80 rounded-2xl border border-slate-200/90 p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                {proofs.length === 0 ? 'Upload Initial Proof' : 'Upload Revised Proof Version'}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Supported formats: PDF, PNG, JPEG (Max 20 MB). Will be assigned the next version number.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setIsUploadOpen(false);
                handleClearSelectedFile();
              }}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors"
              title="Close upload form"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Validation & Upload Errors */}
          {fileValidationError && (
            <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{fileValidationError}</span>
            </div>
          )}

          {uploadError && (
            <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{uploadError}</span>
            </div>
          )}

          <form onSubmit={handleUploadSubmit} className="space-y-4">
            {!selectedFile ? (
              /* Drag & Drop Area */
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-200 flex flex-col items-center justify-center ${
                  dragOver
                    ? 'border-blue-500 bg-blue-50/50'
                    : 'border-slate-300 hover:border-slate-400 bg-white'
                }`}
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleInputChange}
                  accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
                  className="hidden"
                  id="proof-file-input"
                />
                <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mb-3 ring-4 ring-blue-50/50">
                  <Upload className="w-6 h-6" />
                </div>
                <p className="text-sm font-semibold text-slate-800">
                  Click to select file or drag and drop here
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  PDF, PNG, or JPEG up to 20 MB
                </p>
              </div>
            ) : (
              /* Selected File Preview Card */
              <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 overflow-hidden">
                  <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                    {selectedFile.type.includes('pdf') || selectedFile.name.endsWith('.pdf') ? (
                      <FileText className="w-5 h-5" />
                    ) : (
                      <ImageIcon className="w-5 h-5" />
                    )}
                  </div>
                  <div className="truncate">
                    <p className="text-sm font-semibold text-slate-900 truncate">
                      {selectedFile.name}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-500">
                      <span>{formatFileSize(selectedFile.size)}</span>
                      <span>•</span>
                      <span className="uppercase text-[10px] font-bold tracking-wider px-1.5 py-0.2 rounded bg-slate-100">
                        {selectedFile.name.split('.').pop()}
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleClearSelectedFile}
                  disabled={uploading}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors shrink-0 disabled:opacity-50"
                  title="Remove selected file"
                  id="remove-selected-proof-btn"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Action Buttons */}
            {selectedFile && (
              <div className="flex items-center justify-end gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={uploading}
                  onClick={handleClearSelectedFile}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={uploading}
                  id="upload-proof-submit-btn"
                >
                  {uploading ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Uploading Proof...</span>
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5">
                      <Upload className="w-4 h-4" />
                      <span>Upload Proof</span>
                    </span>
                  )}
                </Button>
              </div>
            )}
          </form>
        </div>
      )}

      {/* Proof Versions List or Empty State */}
      {loading ? (
        <div className="space-y-3 py-4">
          <div className="h-16 bg-slate-100 rounded-xl animate-pulse" />
          <div className="h-16 bg-slate-100 rounded-xl animate-pulse" />
        </div>
      ) : proofs.length === 0 ? (
        /* Empty State */
        <div className="text-center py-10 px-4 rounded-xl border border-dashed border-slate-200 bg-slate-50/50 space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-white border border-slate-200 text-slate-400 flex items-center justify-center mx-auto shadow-xs">
            <Upload className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-800">
              No design proofs uploaded yet
            </h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto leading-relaxed">
              Upload customer artwork or your graphic designer's initial layout in PDF, PNG, or JPEG format to start the proofing workflow.
            </p>
          </div>
          {!isUploadOpen && (
            <div>
              <Button
                type="button"
                variant="primary"
                size="sm"
                icon={Upload}
                onClick={() => setIsUploadOpen(true)}
                id="empty-state-upload-proof-btn"
              >
                Upload Design Proof
              </Button>
            </div>
          )}
        </div>
      ) : (
        /* Versions List */
        <div className="space-y-3">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-1">
            Version History ({proofs.length} {proofs.length === 1 ? 'version' : 'versions'})
          </div>

          <div className="divide-y divide-slate-100 border border-slate-200/90 rounded-xl overflow-hidden bg-white shadow-xs">
            {proofs.map((proof, idx) => {
              const formattedDate = new Date(proof.created_at).toLocaleDateString(undefined, {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              });

              const isLatest = idx === 0;
              const isPdf = proof.mime_type.includes('pdf') || proof.original_filename.endsWith('.pdf');

              return (
                <div
                  key={proof.id}
                  className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 hover:bg-slate-50/80 transition-colors"
                >
                  <div className="flex items-start gap-3.5 overflow-hidden">
                    <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center shrink-0 mt-0.5">
                      {isPdf ? (
                        <FileText className="w-5 h-5 text-red-500" />
                      ) : (
                        <ImageIcon className="w-5 h-5 text-blue-500" />
                      )}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded">
                          Version {proof.version_number}
                        </span>
                        {isLatest && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <Sparkles className="w-2.5 h-2.5" />
                            <span>Latest</span>
                          </span>
                        )}
                        <span className="text-xs text-slate-400">•</span>
                        <span className="text-xs text-slate-500">{formattedDate}</span>
                      </div>

                      <p className="mt-1 text-sm font-semibold text-slate-800 truncate" title={proof.original_filename}>
                        {proof.original_filename}
                      </p>

                      <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-400">
                        <span>{formatFileSize(proof.file_size)}</span>
                        <span>•</span>
                        <span className="uppercase text-[10px] font-medium">
                          {proof.original_filename.split('.').pop()}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      icon={viewingId === proof.id ? Loader2 : Eye}
                      disabled={viewingId === proof.id}
                      onClick={() => handleViewProof(proof)}
                      id={`view-proof-btn-v${proof.version_number}`}
                    >
                      {viewingId === proof.id ? (
                        <span>Generating Link...</span>
                      ) : (
                        <span className="flex items-center gap-1.5">
                          <span>View Proof</span>
                          <ExternalLink className="w-3 h-3 text-slate-400" />
                        </span>
                      )}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
