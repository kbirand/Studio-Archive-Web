import React, { useEffect, useState, useMemo, useRef } from 'react';
import api from '../api/axios';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, rectSortingStrategy, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import AdminPanel from '../components/AdminPanel';

const API_BASE = import.meta.env.PROD ? '' : (import.meta.env.VITE_API_URL || 'http://localhost:3002');

const SortableItem = ({ id, children, ratio, onClick }) => {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
    const style = {
        transform: CSS.Transform.toString(transform),
        transition: isDragging ? 'none' : transition,
        zIndex: isDragging ? 50 : 'auto',
        opacity: isDragging ? 0.8 : 1,
    };
    return (
        <div ref={setNodeRef} style={style} {...attributes} {...listeners} className={`${ratio} bg-[#222] overflow-hidden rounded-md cursor-grab active:cursor-grabbing hover:brightness-110 transition-all relative group`} onClick={onClick}>
            {children}
        </div>
    );
};

const SortableWorkItem = ({ id, children }) => {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
    const style = {
        transform: CSS.Transform.toString(transform),
        transition: isDragging ? 'none' : transition,
        zIndex: isDragging ? 50 : 'auto',
        opacity: isDragging ? 0.7 : 1,
    };
    return (
        <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
            {children}
        </div>
    );
};

const Browser = () => {
    // --- STATE ---
    const [worksData, setWorksData] = useState({});
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [user, setUser] = useState(null);
    const [showAdminPanel, setShowAdminPanel] = useState(false);
    const [adminPanelTab, setAdminPanelTab] = useState('users');
    const [showAdminMenu, setShowAdminMenu] = useState(false);
    const [showNewWorkDialog, setShowNewWorkDialog] = useState(false);
    const [newWorkName, setNewWorkName] = useState('');
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [currentUploadFile, setCurrentUploadFile] = useState('');
    const [showSelectWorkDialog, setShowSelectWorkDialog] = useState(false);
    const [uploadTotalFiles, setUploadTotalFiles] = useState(0);
    const [uploadCurrentIndex, setUploadCurrentIndex] = useState(0);

    // View Settings (Persisted)
    const [viewSettings, setViewSettings] = useState(() => {
        try {
            const saved = localStorage.getItem('view_settings');
            return saved ? JSON.parse(saved) : {
                ratio: 'aspect-[2/3]', // Default Vertical
                cols: 5
            };
        } catch (e) {
            return { ratio: 'aspect-[2/3]', cols: 5 };
        }
    });

    // Ref for file input
    const fileInputRef = useRef(null);

    // Sidebar Width State
    const [sidebarWidth, setSidebarWidth] = useState(288); // Default w-72 (288px)
    const [isResizing, setIsResizing] = useState(false);



    // Selection Mode State
    const [isSelectionMode, setIsSelectionMode] = useState(false);
    const [selectedFiles, setSelectedFiles] = useState(new Set());
    const [selectedWorkId, setSelectedWorkId] = useState(null);
    const [workFiles, setWorkFiles] = useState([]);
    const [workDetails, setWorkDetails] = useState(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [previewMode, setPreviewMode] = useState(false);

    // Lightbox State
    const [lightboxIndex, setLightboxIndex] = useState(-1);

    // Download State
    const [downloadStatus, setDownloadStatus] = useState(null); // { state: 'zipping' | 'downloading' | 'error', current: 0, total: 0, jobId: string }
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false); // Modal state
    const pollIntervalRef = useRef(null); // Ref for polling interval

    // DnD Sensors
    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 8,
            },
        })
    );

    // Context Menu & Modal State
    const [contextMenu, setContextMenu] = useState({ visible: false, x: 0, y: 0, work: null });
    const [activeModalWork, setActiveModalWork] = useState(null); // Persist work for modals
    const [showRenameModal, setShowRenameModal] = useState(false);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [renameValue, setRenameValue] = useState('');

    const handleContextMenu = (e, work) => {
        if (!user || user.level !== 'admin') return;
        e.preventDefault();
        setContextMenu({
            visible: true,
            x: e.clientX,
            y: e.clientY,
            work
        });
    };

    // Fix stale closure by using functional update
    const closeContextMenu = () => setContextMenu(prev => ({ ...prev, visible: false }));

    useEffect(() => {
        const handleClick = () => {
            closeContextMenu();
            setShowAdminMenu(false);
        };
        window.addEventListener('click', handleClick);
        return () => window.removeEventListener('click', handleClick);
    }, []);

    const handleRenameClick = () => {
        setActiveModalWork(contextMenu.work); // Save work for modal
        setRenameValue(contextMenu.work?.work_period || '');
        setShowRenameModal(true);
    };

    const handleDeleteClick = () => {
        setActiveModalWork(contextMenu.work); // Save work for modal
        setShowDeleteModal(true);
    };

    const submitRename = async () => {
        if (!activeModalWork || !renameValue) return;
        try {
            await api.put(`/works/${activeModalWork.id}`, { work_period: renameValue });

            // Refresh local data
            setWorksData(prev => {
                const newData = { ...prev };
                return newData;
            });
            await fetchWorks();
            if (selectedWorkId === activeModalWork.id) {
                setWorkDetails(prev => ({ ...prev, work_period: renameValue }));
            }

            setShowRenameModal(false);
            setActiveModalWork(null);
        } catch (err) {
            console.error("Rename failed", err);
            alert("Failed to rename work");
        }
    };

    const submitDelete = async () => {
        if (!activeModalWork) return;
        try {
            await api.delete(`/works/${activeModalWork.id}`);

            await fetchWorks();
            if (selectedWorkId === activeModalWork.id) {
                setSelectedWorkId(null);
                setWorkDetails(null);
                setWorkFiles([]);
            }
            setShowDeleteModal(false);
            setActiveModalWork(null);
        } catch (err) {
            console.error("Delete failed", err);
            alert("Failed to delete work");
        }
    };
    const handleDragEnd = (event) => {
        const { active, over } = event;

        if (active.id !== over.id) {
            setWorkFiles((items) => {
                const oldIndex = items.findIndex((item) => item.id === active.id);
                const newIndex = items.findIndex((item) => item.id === over.id);
                const newItems = arrayMove(items, oldIndex, newIndex);

                // Sync with backend (fire and forget)
                api.post(`/works/${workDetails.id}/reorder`, {
                    fileIds: newItems.map(f => f.id).reverse()
                }).catch(err => console.error("Reorder failed", err));

                return newItems;
            });
        }
    };

    const handleThumbnailClick = (fileId, index) => {
        if (isSelectionMode) {
            const newSelected = new Set(selectedFiles);
            if (newSelected.has(fileId)) {
                newSelected.delete(fileId);
            } else {
                newSelected.add(fileId);
            }
            setSelectedFiles(newSelected);
        } else {
            setLightboxIndex(index);
        }
    };



    const handleDownload = async () => {
        if (!workDetails) return;
        setDownloadStatus({ state: 'zipping', current: 0, total: 0 });

        try {
            // Start Job
            const startRes = await api.post(`/works/${workDetails.id}/download/start`, {
                fileIds: isSelectionMode && selectedFiles.size > 0 ? Array.from(selectedFiles) : undefined
            });
            const { jobId, total } = startRes.data;
            setDownloadStatus(prev => ({ ...prev, total, jobId }));

            // Poll Loop
            pollIntervalRef.current = setInterval(async () => {
                try {
                    const statusRes = await api.get(`/works/download/status/${jobId}`);
                    const { status, current } = statusRes.data;

                    setDownloadStatus(prev => prev ? ({ ...prev, current }) : null);

                    if (status === 'ready') {
                        clearInterval(pollIntervalRef.current);
                        setDownloadStatus({ state: 'downloading', current: total, total, jobId });

                        // Download File
                        window.location.href = `${API_BASE}/api/works/download/file/${jobId}`;

                        // Reset after delay
                        setTimeout(() => setDownloadStatus(null), 2000);
                    } else if (status === 'error') {
                        clearInterval(pollIntervalRef.current);
                        setDownloadStatus({ state: 'error' });
                        alert("Zip generation failed");
                        setTimeout(() => setDownloadStatus(null), 2000);
                    }
                } catch (e) {
                    // Check if 404 (likely cancelled)
                    if (e.response && e.response.status === 404) {
                        clearInterval(pollIntervalRef.current);
                        setDownloadStatus(null);
                        return;
                    }
                    console.error("Polling error", e);
                    clearInterval(pollIntervalRef.current);
                    setDownloadStatus({ state: 'error' });
                }
            }, 1000);

        } catch (err) {
            console.error("Download start failed", err);
            setDownloadStatus({ state: 'error' });
            setTimeout(() => setDownloadStatus(null), 2000);
        }
    };

    const handleCancelDownload = async () => {
        if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
        }
        if (downloadStatus && downloadStatus.jobId) {
            try {
                await api.post(`/works/download/cancel/${downloadStatus.jobId}`);
            } catch (e) {
                console.error("Cancel failed", e);
            }
        }
        setDownloadStatus(null);
    };

    const handleSelectAll = () => {
        if (selectedFiles.size === workFiles.length) {
            setSelectedFiles(new Set());
        } else {
            setSelectedFiles(new Set(workFiles.map(f => f.id)));
        }
    };

    const handleToggleVisibility = async (e, work) => {
        e.stopPropagation();
        if (!user || user.level !== 'admin') return;

        const newVisibility = work.visible === 1 ? 0 : 1;

        try {
            await api.put(`/works/${work.id}/visibility`, { visible: newVisibility });

            // Update local state
            setWorksData(prev => {
                const newData = { ...prev };
                // Find the period this work belongs to
                const period = work.work_period || 'Unknown';
                if (newData[period]) {
                    newData[period] = newData[period].map(w =>
                        w.id === work.id ? { ...w, visible: newVisibility } : w
                    );
                }
                return newData;
            });
        } catch (err) {
            console.error("Failed to toggle visibility", err);
            alert("Failed to update visibility");
        }
    };

    const handleToggleFileVisibility = async (e, file) => {
        e.stopPropagation();
        if (!user || user.level !== 'admin') return;

        const newVisibility = file.visible === 1 ? 0 : 1;

        try {
            await api.put(`/works/files/${file.id}/visibility`, { visible: newVisibility });

            // Update local state
            setWorkFiles(prev => prev.map(f =>
                f.id === file.id ? { ...f, visible: newVisibility } : f
            ));
        } catch (err) {
            console.error("Failed to toggle file visibility", err);
            alert("Failed to update file visibility");
        }
    };

    const handleWorksDragEnd = async (event) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;
        if (!user || user.level !== 'admin') return;

        const oldIndex = filteredSidebarWorks.findIndex(w => w.id === active.id);
        const newIndex = filteredSidebarWorks.findIndex(w => w.id === over.id);

        if (oldIndex === -1 || newIndex === -1) return;

        const newOrder = arrayMove(filteredSidebarWorks, oldIndex, newIndex);
        const workIds = newOrder.map(w => w.id);

        // Update local state immediately for responsiveness
        setWorksData(prev => {
            const newData = { ...prev };
            // Since filteredSidebarWorks is derived from allWorks, we need to update the underlying data
            // For simplicity, we'll update the ordered field in worksData
            Object.keys(newData).forEach(period => {
                newData[period] = newData[period].map(work => {
                    const newOrderIndex = workIds.indexOf(work.id);
                    if (newOrderIndex !== -1) {
                        return { ...work, ordered: workIds.length - newOrderIndex };
                    }
                    return work;
                });
            });
            return newData;
        });

        // Save to backend
        try {
            await api.post('/works/reorder', { workIds });
        } catch (err) {
            console.error("Failed to reorder works", err);
            // Optionally refetch to restore order
        }
    };

    const handleDeleteSelected = async () => {
        if (!user || user.level !== 'admin') return;
        if (selectedFiles.size === 0) return;
        setShowDeleteConfirm(true);
    };

    // ...



    const confirmDelete = async () => {
        try {
            await api.post(`/works/${workDetails.id}/files/delete`, {
                fileIds: Array.from(selectedFiles)
            });
            // Remove deleted files from state
            setWorkFiles(prev => prev.filter(f => !selectedFiles.has(f.id)));
            setSelectedFiles(new Set());
            setIsSelectionMode(false);
            setShowDeleteConfirm(false);
        } catch (err) {
            console.error("Delete failed", err);
            alert("Failed to delete files");
            setShowDeleteConfirm(false);
        }
    };

    const handleCreateWork = async () => {
        if (!newWorkName.trim()) {
            alert("Please enter a work name");
            return;
        }

        try {
            const res = await api.post('/works/create', { name: newWorkName.trim() });
            if (res.data.success) {
                // Refresh works list
                await fetchWorks();
                // Select the new work
                setSelectedWorkId(res.data.id);
                // Close dialog and reset
                setShowNewWorkDialog(false);
                setNewWorkName('');
            }
        } catch (err) {
            console.error("Failed to create work", err);
            alert("Failed to create work: " + (err.response?.data?.error || err.message));
        }
    };

    const handleFileSelect = async (files) => {
        if (!files || files.length === 0) return;
        if (!selectedWorkId) {
            setShowSelectWorkDialog(true);
            return;
        }

        const filesArray = Array.from(files);
        setUploading(true);
        setUploadTotalFiles(filesArray.length);
        setUploadCurrentIndex(0);
        setUploadProgress(0);

        try {
            for (let i = 0; i < filesArray.length; i++) {
                const file = filesArray[i];
                setUploadCurrentIndex(i);
                setCurrentUploadFile(file.name);
                setUploadProgress(0);

                const formData = new FormData();
                formData.append('photos', file);

                await api.post(`/works/${selectedWorkId}/upload`, formData, {
                    headers: { 'Content-Type': 'multipart/form-data' },
                    onUploadProgress: (progressEvent) => {
                        const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                        setUploadProgress(percentCompleted);
                    }
                });
            }

            // After all finished, refresh
            const detailRes = await api.get(`/works/${selectedWorkId}`);
            setWorkDetails(detailRes.data.work);
            const sortedFiles = detailRes.data.files.sort((a, b) => b.ordered - a.ordered);
            setWorkFiles(sortedFiles);
            fetchWorks();

        } catch (err) {
            console.error("Upload failed", err);
            alert("Upload failed: " + (err.response?.data?.error || err.message));
        } finally {
            setUploading(false);
            setUploadProgress(0);
            setUploadCurrentIndex(0);
            setUploadTotalFiles(0);
            setCurrentUploadFile('');
            if (fileInputRef.current) fileInputRef.current.value = '';
            if (folderInputRef.current) folderInputRef.current.value = '';
        }
    };

    // --- EFFECTS ---

    useEffect(() => {
        // Load user data
        const loadUser = async () => {
            try {
                const userData = localStorage.getItem('user_data');
                if (userData) {
                    const parsed = JSON.parse(userData);
                    setUser(parsed);

                    // Initialize sidebar width from cached user data if available
                    if (parsed.preferences && parsed.preferences.sidebarWidth) {
                        setSidebarWidth(parsed.preferences.sidebarWidth);
                    }
                    if (parsed.preferences && parsed.preferences.viewSettings) {
                        setViewSettings(parsed.preferences.viewSettings);
                    }

                    // Refresh from server
                    try {
                        const res = await api.get('/auth/me');
                        const freshUser = res.data;
                        setUser(freshUser);
                        localStorage.setItem('user_data', JSON.stringify(freshUser));

                        // Update sidebar width from fresh data
                        if (freshUser.preferences && freshUser.preferences.sidebarWidth) {
                            setSidebarWidth(freshUser.preferences.sidebarWidth);
                        }
                        if (freshUser.preferences && freshUser.preferences.viewSettings) {
                            setViewSettings(freshUser.preferences.viewSettings);
                        }
                    } catch (err) {
                        console.error("Failed to refresh session", err);
                    }
                }
            } catch (e) {
                console.error("Failed to parse user data");
            }
        };

        loadUser();
    }, []);

    // Fetch works when preview status changes
    useEffect(() => {
        fetchWorks();
        if (selectedWorkId) {
            handleWorkClick(selectedWorkId, true);
        }
    }, [previewMode]);

    // Handle Sidebar Resizing
    useEffect(() => {
        const handleMouseMove = (e) => {
            if (!isResizing) return;
            const newWidth = Math.max(200, Math.min(e.clientX, 600)); // Min 200px, Max 600px
            setSidebarWidth(newWidth);
        };

        const handleMouseUp = async () => {
            if (!isResizing) return;
            setIsResizing(false);

            // Persist to backend
            if (user) {
                try {
                    const newPreferences = {
                        ...(user.preferences || {}),
                        sidebarWidth: sidebarWidth
                    };

                    // Optimistic update of local user state
                    const updatedUser = { ...user, preferences: newPreferences };
                    setUser(updatedUser);
                    localStorage.setItem('user_data', JSON.stringify(updatedUser));

                    await api.put('/auth/preferences', { preferences: newPreferences });
                } catch (err) {
                    console.error("Failed to save sidebar preference", err);
                }
            }
        };

        if (isResizing) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isResizing, sidebarWidth, user]);

    // Persist view settings (Local + Server)
    useEffect(() => {
        // 1. Local Persistence
        localStorage.setItem('view_settings', JSON.stringify(viewSettings));

        // 2. Server Persistence (Debounced)
        if (!user) return;

        // Avoid infinite loop if values are identical
        if (user.preferences && JSON.stringify(user.preferences.viewSettings) === JSON.stringify(viewSettings)) {
            return;
        }

        const timeoutId = setTimeout(async () => {
            try {
                const newPreferences = {
                    ...(user.preferences || {}),
                    viewSettings: viewSettings
                };

                // Optimistic Update
                const updatedUser = { ...user, preferences: newPreferences };
                setUser(updatedUser);
                localStorage.setItem('user_data', JSON.stringify(updatedUser));

                // API Call
                await api.put('/auth/preferences', { preferences: newPreferences });
            } catch (err) {
                console.error("Failed to save view settings", err);
            }
        }, 1000); // 1s debounce

        return () => clearTimeout(timeoutId);
    }, [viewSettings, user]);

    // Handle Keyboard Navigation for Lightbox
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (lightboxIndex === -1) return;

            if (e.key === 'Escape') {
                setLightboxIndex(-1);
            } else if (e.key === 'ArrowLeft') {
                setLightboxIndex(prev => (prev > 0 ? prev - 1 : prev));
            } else if (e.key === 'ArrowRight') {
                setLightboxIndex(prev => (prev < workFiles.length - 1 ? prev + 1 : prev));
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [lightboxIndex, workFiles]);





    const fetchWorks = async () => {
        try {
            const res = await api.get(`/works${previewMode ? '?preview=1' : ''}`);
            setWorksData(res.data);
            setLoading(false);
        } catch (err) {
            console.error("Failed to fetch works", err);
            setLoading(false);
        }
    };

    const handleWorkClick = async (workId, force = false) => {
        if (selectedWorkId === workId && !force) {
            return;
        }

        setSelectedWorkId(workId);
        setIsSelectionMode(false);
        setSelectedFiles(new Set());
        setDetailLoading(true);
        try {
            const res = await api.get(`/works/${workId}${previewMode ? '?preview=1' : ''}`);
            setWorkDetails(res.data.work);
            // Enforce numeric sort by 'ordered' column just in case
            const sortedFiles = res.data.files.sort((a, b) => b.ordered - a.ordered);
            setWorkFiles(sortedFiles);
        } catch (err) {
            console.error("Failed to fetch work details", err);
        } finally {
            setDetailLoading(false);
        }
    };

    const logout = async () => {
        try {
            await api.post('/auth/logout');
        } catch (e) {
            console.error("Logout log failed", e);
        }
        localStorage.clear();
        window.location.reload();
    };

    // Flatten works for the sidebar list
    const allWorks = useMemo(() => {
        let works = [];
        Object.values(worksData).forEach(periodWorks => {
            works = [...works, ...periodWorks];
        });
        return works.sort((a, b) => (b.ordered || 0) - (a.ordered || 0));
    }, [worksData]);

    const filteredSidebarWorks = useMemo(() => {
        if (!searchTerm) return allWorks;
        const lower = searchTerm.toLowerCase();
        return allWorks.filter(w =>
            (w.work_period && w.work_period.toLowerCase().includes(lower)) ||
            (w.talent && w.talent.toLowerCase().includes(lower)) ||
            (w.stylist && w.stylist.toLowerCase().includes(lower)) ||
            (w.hair && w.hair.toLowerCase().includes(lower)) ||
            (w.makeup && w.makeup.toLowerCase().includes(lower)) ||
            (w.path && w.path.toLowerCase().includes(lower))
        );
    }, [allWorks, searchTerm]);

    // Global Keyboard Shortcuts
    useEffect(() => {
        const handleGlobalKeyDown = (e) => {
            // Ignore if typing in an input or textarea
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            // Ignore if any modal is open (except for shortcuts intended for them)
            if (showAdminPanel || showNewWorkDialog || showDeleteConfirm) return;

            // Thumbnail Sizing
            if (e.key === '=' || e.key === '+') {
                setViewSettings(prev => ({ ...prev, cols: Math.max(2, prev.cols - 1) }));
            } else if (e.key === '-') {
                setViewSettings(prev => ({ ...prev, cols: Math.min(10, prev.cols + 1) }));
            }

            // Aspect Ratios
            else if (e.key === '1') {
                setViewSettings(prev => ({ ...prev, ratio: 'aspect-[3/2]' }));
            } else if (e.key === '2') {
                setViewSettings(prev => ({ ...prev, ratio: 'aspect-square' }));
            } else if (e.key === '3') {
                setViewSettings(prev => ({ ...prev, ratio: 'aspect-[2/3]' }));
            }

            // Works Navigation
            else if (e.key.toLowerCase() === 'q') {
                const currentIndex = filteredSidebarWorks.findIndex(w => w.id === selectedWorkId);
                if (currentIndex > 0) {
                    handleWorkClick(filteredSidebarWorks[currentIndex - 1].id);
                }
            } else if (e.key.toLowerCase() === 'a') {
                const currentIndex = filteredSidebarWorks.findIndex(w => w.id === selectedWorkId);
                if (currentIndex !== -1 && currentIndex < filteredSidebarWorks.length - 1) {
                    handleWorkClick(filteredSidebarWorks[currentIndex + 1].id);
                } else if (currentIndex === -1 && filteredSidebarWorks.length > 0) {
                    handleWorkClick(filteredSidebarWorks[0].id);
                }
            }
        };

        window.addEventListener('keydown', handleGlobalKeyDown);
        return () => window.removeEventListener('keydown', handleGlobalKeyDown);
    }, [filteredSidebarWorks, selectedWorkId, showAdminPanel, showNewWorkDialog, showDeleteConfirm]);

    if (loading) return <div className="text-white p-10">Loading...</div>;

    // --- RENDER LIGHTBOX ---
    if (lightboxIndex >= 0 && workFiles.length > 0) {
        const currentFile = workFiles[lightboxIndex];
        return (
            <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center">
                <button
                    className="absolute top-4 right-4 text-white hover:text-gray-300 z-50 p-2"
                    onClick={() => setLightboxIndex(-1)}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>

                {lightboxIndex > 0 && (
                    <button
                        className="absolute left-4 text-white hover:text-gray-300 p-4"
                        onClick={() => setLightboxIndex(lightboxIndex - 1)}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                    </button>
                )}
                {lightboxIndex < workFiles.length - 1 && (
                    <button
                        className="absolute right-4 text-white hover:text-gray-300 p-4"
                        onClick={() => setLightboxIndex(lightboxIndex + 1)}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                    </button>
                )}

                <img
                    src={`${API_BASE}/api/assets?path=${encodeURIComponent(workDetails?.path || '')}&file=${encodeURIComponent(workFiles[lightboxIndex].file)}&type=preview`}
                    alt={workFiles[lightboxIndex].file}
                    className="max-h-screen max-w-full object-contain"
                />
                <div className="absolute bottom-4 text-white text-sm bg-black/50 px-3 py-1 rounded">
                    {lightboxIndex + 1} / {workFiles.length}
                </div>
            </div>
        );
    }

    // --- MAIN UI ---
    return (
        <div className="flex h-screen bg-[#1a1a1a] text-white font-sans overflow-hidden">
            {/* Sidebar */}
            <div
                className="bg-[#1f1f1f] flex-shrink-0 border-r border-[#333] flex flex-col relative"
                style={{ width: sidebarWidth }}
            >
                {/* Drag Handle */}
                <div
                    className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-blue-500 transition-colors z-10"
                    onMouseDown={(e) => {
                        e.preventDefault();
                        setIsResizing(true);
                    }}
                ></div>
                {/* Sidebar Header - Fixed Height to match Top Bar */}
                <div className="h-32 px-5 flex flex-col justify-center border-b border-[#333]">
                    <h1 className="text-5xl font-helvetica-thin tracking-wide text-gray-200">Works</h1>
                </div>

                <div className="overflow-y-auto flex-1 py-2">
                    {user && user.level === 'admin' ? (
                        <DndContext
                            sensors={sensors}
                            collisionDetection={closestCenter}
                            onDragEnd={handleWorksDragEnd}
                        >
                            <SortableContext
                                items={filteredSidebarWorks.map(w => w.id)}
                                strategy={verticalListSortingStrategy}
                            >
                                {filteredSidebarWorks.map(work => (
                                    <SortableWorkItem key={work.id} id={work.id}>
                                        <button
                                            onClick={() => handleWorkClick(work.id)}
                                            onContextMenu={(e) => handleContextMenu(e, work)}
                                            className={`w-full tracking-wide text-left px-5 py-2 text-lg font-helvetica-light transition-colors truncate cursor-grab active:cursor-grabbing
                                                ${selectedWorkId === work.id ? 'bg-[#2a2a2a] text-white border-l-2 border-white' : 'text-gray-400 hover:text-gray-200 hover:bg-[#252525]'}`}
                                        >
                                            <div className="flex items-center justify-between w-full">
                                                <span className="truncate flex-1">
                                                    {work.work_period || work.talent || work.path}
                                                </span>
                                                {user && user.level === 'admin' && !previewMode && (
                                                    <div
                                                        onClick={(e) => handleToggleVisibility(e, work)}
                                                        className={`ml-2 w-4 h-4 rounded border flex items-center justify-center cursor-pointer flex-shrink-0 transition-all ${work.visible === 1 ? 'bg-primary border-primary opacity-30' : 'bg-black/40 border-gray-400 hover:border-gray-200 opacity-10'}`}
                                                        title={work.visible === 1 ? "Visible" : "Hidden"}
                                                    >
                                                        {work.visible === 1 && (
                                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-white" viewBox="0 0 20 20" fill="currentColor">
                                                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                                            </svg>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </button>
                                    </SortableWorkItem>
                                ))}
                            </SortableContext>
                        </DndContext>
                    ) : (
                        filteredSidebarWorks.map(work => (
                            <button
                                key={work.id}
                                onClick={() => handleWorkClick(work.id)}
                                onContextMenu={(e) => handleContextMenu(e, work)}
                                className={`w-full tracking-wide text-left px-5 py-2 text-lg font-helvetica-light transition-colors truncate
                                    ${selectedWorkId === work.id ? 'bg-[#2a2a2a] text-white border-l-2 border-white' : 'text-gray-400 hover:text-gray-200 hover:bg-[#252525]'}`}
                            >
                                <div className="flex items-center justify-between w-full">
                                    <span className="truncate flex-1">{work.work_period || work.talent || work.path}</span>
                                </div>
                            </button>
                        ))
                    )}
                </div>

                <div className="p-4 border-t border-[#333] flex flex-col gap-3">
                    <div className="relative">
                        {/* Search Icon */}
                        <div className="absolute inset-y-0 left-0 pl-2 flex items-center pointer-events-none">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                        </div>
                        <input
                            type="text"
                            placeholder="Search"
                            className="w-full bg-[#2a2a2a] text-gray-300 pl-8 pr-8 py-1.5 rounded text-sm focus:outline-none focus:ring-1 focus:ring-gray-500 placeholder-gray-600"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                        {/* Clear Button */}
                        {searchTerm && (
                            <button
                                onClick={() => setSearchTerm('')}
                                className="absolute inset-y-0 right-0 pr-2 flex items-center group"
                            >
                                <div className="bg-gray-600 rounded-full p-0.5 group-hover:bg-gray-500 transition-colors">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-[#1a1a1a]" viewBox="0 0 20 20" fill="currentColor">
                                        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                                    </svg>
                                </div>
                            </button>
                        )}
                    </div>
                    <div className="text-xs text-gray-600 flex justify-between">
                        <span>{allWorks.length} Items</span>
                    </div>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 flex flex-col h-full bg-[#1a1a1a]">

                {/* Top Bar - Matches Sidebar Header Height (h-32) */}
                <div className="h-32 bg-[#1a1a1a] px-8 border-b border-[#333] flex items-center justify-between">

                    {/* Left: Title & Download (Aligned with 'Works' in sidebar via matching layout) */}
                    <div className="flex flex-col justify-center h-full mr-8">
                        <div className="flex items-center gap-4">
                            {workDetails ? (
                                <>
                                    <h2 className="text-5xl font-helvetica-thin text-gray-100 truncate" title={workDetails.work_period || workDetails.path}>
                                        {workDetails.work_period || workDetails.talent || workDetails.path}
                                    </h2>
                                    <button
                                        className={`text-gray-500 hover:text-white transition-colors flex-shrink-0 ${downloadStatus ? 'opacity-50 cursor-not-allowed' : ''}`}
                                        title="Download"
                                        onClick={handleDownload}
                                        disabled={!!downloadStatus}
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                                    </button>
                                </>
                            ) : (
                                <h2 className="text-5xl font-helvetica-thin text-gray-500">Select a work</h2>
                            )}
                        </div>
                    </div>



                    {/* Right: Controls & User */}
                    <div className="flex items-center justify-end gap-8 flex-shrink-0">
                        {/* View Controls */}
                        <div className="flex items-center gap-6">
                            {/* Selection Action Bar (Moved here) */}
                            {isSelectionMode && (
                                <div className="flex items-center gap-4 mr-6 text-sm font-helvetica-medium">
                                    <button onClick={handleSelectAll} className="text-gray-300 hover:text-white transition-colors">
                                        {selectedFiles.size === workFiles.length ? "Deselect All" : "Select All"}
                                    </button>
                                    <div className="h-4 w-px bg-gray-700"></div>

                                    {selectedFiles.size > 0 && (
                                        <>
                                            <span className="text-gray-300">{selectedFiles.size} Selected</span>
                                            <div className="h-4 w-px bg-gray-700"></div>
                                            <button onClick={handleDownload} className="text-gray-300 hover:text-white flex items-center gap-1 transition-colors">
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                                                Download
                                            </button>
                                            {user && user.level === 'admin' && (
                                                <button onClick={handleDeleteSelected} className="text-gray-300 hover:text-red-500 flex items-center gap-1 transition-colors">
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                                    Delete
                                                </button>
                                            )}
                                        </>
                                    )}
                                </div>
                            )}
                            {/* Preview Mode Toggle (Admins Only) */}
                            {user && user.level === 'admin' && (
                                <div className="bg-[#2a2a2a] rounded p-1">
                                    <button
                                        onClick={() => setPreviewMode(!previewMode)}
                                        className={`p-2 rounded transition-colors ${previewMode ? 'bg-[#444] text-white' : 'text-gray-500 hover:text-gray-300'}`}
                                        title={previewMode ? "Exit Preview" : "Preview as User"}
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                        </svg>
                                    </button>
                                </div>
                            )}

                            {/* Selection Toggle */}
                            <div className="bg-[#2a2a2a] rounded p-1">
                                <button
                                    onClick={() => setIsSelectionMode(!isSelectionMode)}
                                    className={`p-2 rounded transition-colors ${isSelectionMode ? 'bg-primary text-white' : 'text-gray-500 hover:text-gray-300'}`}
                                    title={isSelectionMode ? "Cancel Selection" : "Select Photos"}
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                </button>
                            </div>

                            {/* Separator */}
                            <div className="h-6 w-px bg-gray-700"></div>

                            {/* Aspect Ratio Toggle */}
                            <div className="bg-[#2a2a2a] rounded p-1 flex items-center">
                                <button
                                    onClick={() => setViewSettings({ ...viewSettings, ratio: 'aspect-[3/2]' })}
                                    className={`p-2 rounded hover:bg-[#3d3d3d] transition-colors ${viewSettings.ratio === 'aspect-[3/2]' ? 'bg-[#3d3d3d] text-white' : 'text-gray-500'}`}
                                    title="Horizontal"
                                >
                                    <div className="w-5 h-3 border-2 border-current rounded-sm"></div>
                                </button>
                                <button
                                    onClick={() => setViewSettings({ ...viewSettings, ratio: 'aspect-square' })}
                                    className={`p-2 rounded hover:bg-[#3d3d3d] transition-colors ${viewSettings.ratio === 'aspect-square' ? 'bg-[#3d3d3d] text-white' : 'text-gray-500'}`}
                                    title="Square"
                                >
                                    <div className="w-4 h-4 border-2 border-current rounded-sm"></div>
                                </button>
                                <button
                                    onClick={() => setViewSettings({ ...viewSettings, ratio: 'aspect-[2/3]' })}
                                    className={`p-2 rounded hover:bg-[#3d3d3d] transition-colors ${viewSettings.ratio === 'aspect-[2/3]' ? 'bg-[#3d3d3d] text-white' : 'text-gray-500'}`}
                                    title="Vertical"
                                >
                                    <div className="w-3 h-5 border-2 border-current rounded-sm"></div>
                                </button>
                            </div>

                            {/* Size Slider */}
                            <div className="flex items-center gap-3">
                                <input
                                    type="range"
                                    min="2"
                                    max="10"
                                    step="1"
                                    value={12 - viewSettings.cols}
                                    onChange={(e) => {
                                        const val = parseInt(e.target.value);
                                        setViewSettings({ ...viewSettings, cols: 12 - val })
                                    }}
                                    className="w-32 h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-red-600 hover:accent-red-500"
                                />
                            </div>
                        </div>

                        {/* Divider */}
                        <div className="h-6 w-px bg-gray-700"></div>

                        {/* Right: User */}
                        <div className="flex items-center gap-6 text-sm">
                            {user && user.level === 'admin' && (
                                <div className="relative">
                                    <button
                                        onClick={(e) => { e.stopPropagation(); setShowAdminMenu(!showAdminMenu); }}
                                        className="px-2 py-1 bg-red-500/10 border border-red-500 text-red-500 rounded font-bold tracking-wider text-xs hover:bg-red-500/20 transition-colors cursor-pointer"
                                    >
                                        ADMIN ▾
                                    </button>
                                    {showAdminMenu && (
                                        <div
                                            className="absolute right-0 top-full mt-1 bg-[#2a2a2a] border border-[#444] rounded shadow-lg z-50 min-w-[160px]"
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            <button
                                                onClick={() => { setShowNewWorkDialog(true); setShowAdminMenu(false); }}
                                                className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-[#333] hover:text-white transition-colors"
                                            >
                                                New Work
                                            </button>
                                            <button
                                                onClick={() => { fileInputRef.current?.click(); setShowAdminMenu(false); }}
                                                className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-[#333] hover:text-white transition-colors"
                                            >
                                                Add Photos
                                            </button>
                                            <div className="h-px bg-[#444] my-1"></div>
                                            <button
                                                onClick={() => { setAdminPanelTab('logs'); setShowAdminPanel(true); setShowAdminMenu(false); }}
                                                className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-[#333] hover:text-white transition-colors"
                                            >
                                                Activity Logs
                                            </button>
                                            <div className="h-px bg-[#444] my-1"></div>
                                            <button
                                                onClick={() => { setAdminPanelTab('users'); setShowAdminPanel(true); setShowAdminMenu(false); }}
                                                className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-[#333] hover:text-white transition-colors"
                                            >
                                                Admin Panel
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                            <button onClick={logout} className="text-gray-400 hover:text-white transition-colors">Logout</button>
                            {user && user.picture ? (
                                <img
                                    src={user.picture}
                                    alt="User"
                                    className="w-8 h-8 rounded-full border border-gray-600 bg-gray-700 object-cover"
                                    referrerPolicy="no-referrer"
                                />
                            ) : (
                                <div className="w-8 h-8 rounded-full bg-gray-600 flex items-center justify-center text-xs text-white font-bold">
                                    {user?.username?.[0]?.toUpperCase() || '?'}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {
                    selectedWorkId && workDetails ? (
                        <>
                            {/* Image Grid */}
                            <div className="flex-1 overflow-y-auto px-8 py-8" id="image-grid-container">
                                {detailLoading ? (
                                    <div className="text-gray-500">Loading images...</div>
                                ) : user && user.level === 'admin' ? (
                                    <DndContext
                                        sensors={sensors}
                                        collisionDetection={closestCenter}
                                        onDragEnd={handleDragEnd}
                                    >
                                        <div
                                            className="grid gap-4 transition-all duration-200 ease-out pb-20 relative"
                                            style={{
                                                gridTemplateColumns: `repeat(${viewSettings.cols}, minmax(0, 1fr))`
                                            }}
                                        >
                                            <SortableContext
                                                items={workFiles.map(f => f.id)}
                                                strategy={rectSortingStrategy}
                                            >
                                                {workFiles.map((file, idx) => (
                                                    <SortableItem
                                                        key={file.id}
                                                        id={file.id}
                                                        ratio={viewSettings.ratio}
                                                        onClick={() => handleThumbnailClick(file.id, idx)}
                                                    >
                                                        <div className={`relative w-full h-full ${selectedFiles.has(file.id) ? 'ring-2 ring-primary' : ''}`}>
                                                            <img
                                                                src={`${API_BASE}/api/assets?path=${encodeURIComponent(workDetails.path)}&file=${encodeURIComponent(file.file)}&type=thumb`}
                                                                alt={file.file}
                                                                className={`w-full h-full object-cover pointer-events-none ${selectedFiles.has(file.id) ? 'opacity-80' : ''}`}
                                                                loading="lazy"
                                                            />
                                                            {/* Checkbox Overlay */}
                                                            {isSelectionMode && (
                                                                <div className="absolute top-2 left-2 z-20">
                                                                    <div className={`w-5 h-5 rounded border border-white/50 flex items-center justify-center ${selectedFiles.has(file.id) ? 'bg-primary border-primary' : 'bg-black/30'}`}>
                                                                        {selectedFiles.has(file.id) && (
                                                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-white" viewBox="0 0 20 20" fill="currentColor">
                                                                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                                                            </svg>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            )}

                                                            {/* Admin Visibility Toggle (Files) */}
                                                            {!isSelectionMode && !previewMode && (
                                                                <div
                                                                    className="absolute top-2 left-2 z-30 opacity-0 group-hover:opacity-100 transition-opacity"
                                                                    onClick={(e) => handleToggleFileVisibility(e, file)}
                                                                >
                                                                    <div
                                                                        className={`w-4 h-4 rounded flex items-center justify-center cursor-pointer transition-all border border-gray-800 ${file.visible === 1 ? 'bg-primary' : 'bg-gray-700 hover:bg-gray-600'}`}
                                                                        title={file.visible === 1 ? "Visible" : "Hidden"}
                                                                    >
                                                                        {file.visible === 1 && (
                                                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="white" stroke="black" strokeWidth="1">
                                                                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                                                            </svg>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            )}
                                                            {!isSelectionMode && !previewMode && (
                                                                <button
                                                                    className="absolute top-2 right-2 p-1.5 bg-black/60 hover:bg-black/80 text-white rounded opacity-0 group-hover:opacity-100 transition-opacity z-10"
                                                                    title="Download Original"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        const url = `${API_BASE}/api/assets?path=${encodeURIComponent(workDetails.path)}&file=${encodeURIComponent(file.file)}&type=original`;
                                                                        const link = document.createElement('a');
                                                                        link.href = url;
                                                                        link.download = file.file;
                                                                        document.body.appendChild(link);
                                                                        link.click();
                                                                        document.body.removeChild(link);
                                                                    }}
                                                                >
                                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                                                    </svg>
                                                                </button>
                                                            )}
                                                        </div>
                                                    </SortableItem>
                                                ))}
                                            </SortableContext>
                                        </div>
                                    </DndContext>
                                ) : (
                                    /* Non-admin static grid */
                                    <div
                                        className="grid gap-4 transition-all duration-200 ease-out pb-20 relative"
                                        style={{
                                            gridTemplateColumns: `repeat(${viewSettings.cols}, minmax(0, 1fr))`
                                        }}
                                    >
                                        {workFiles.map((file, idx) => (
                                            <div
                                                key={file.id}
                                                className={`${viewSettings.ratio} bg-[#222] overflow-hidden rounded-md hover:brightness-110 transition-all relative group cursor-pointer`}
                                                onClick={() => handleThumbnailClick(file.id, idx)}
                                            >
                                                <div className={`relative w-full h-full ${selectedFiles.has(file.id) ? 'ring-2 ring-primary' : ''}`}>
                                                    <img
                                                        src={`${API_BASE}/api/assets?path=${encodeURIComponent(workDetails.path)}&file=${encodeURIComponent(file.file)}&type=thumb`}
                                                        alt={file.file}
                                                        className={`w-full h-full object-cover pointer-events-none ${selectedFiles.has(file.id) ? 'opacity-80' : ''}`}
                                                        loading="lazy"
                                                    />
                                                    {/* Checkbox Overlay */}
                                                    {isSelectionMode && (
                                                        <div className="absolute top-2 left-2 z-20">
                                                            <div className={`w-5 h-5 rounded border border-white/50 flex items-center justify-center ${selectedFiles.has(file.id) ? 'bg-primary border-primary' : 'bg-black/30'}`}>
                                                                {selectedFiles.has(file.id) && (
                                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-white" viewBox="0 0 20 20" fill="currentColor">
                                                                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                                                    </svg>
                                                                )}
                                                            </div>
                                                        </div>
                                                    )}
                                                    {!isSelectionMode && (
                                                        <button
                                                            className="absolute top-2 right-2 p-1.5 bg-black/60 hover:bg-black/80 text-white rounded opacity-0 group-hover:opacity-100 transition-opacity z-10"
                                                            title="Download Original"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                const url = `${API_BASE}/api/assets?path=${encodeURIComponent(workDetails.path)}&file=${encodeURIComponent(file.file)}&type=original`;
                                                                const link = document.createElement('a');
                                                                link.href = url;
                                                                link.download = file.file;
                                                                document.body.appendChild(link);
                                                                link.click();
                                                                document.body.removeChild(link);
                                                            }}
                                                        >
                                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                                            </svg>
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Metadata Footer */}
                            <div className="bg-[#1f1f1f] p-6 border-t border-[#333] text-lg font-helvetica-thin">
                                <div className="grid grid-cols-[100px_1fr] gap-y-2 max-w-2xl">
                                    <span className="text-gray-500">Talent:</span>
                                    {user && user.level === 'admin' ? (
                                        <input
                                            key={`talent-${workDetails.id}`}
                                            type="text"
                                            className="bg-transparent text-gray-300 border-b border-transparent hover:border-gray-600 focus:border-gray-400 focus:outline-none transition-colors"
                                            defaultValue={workDetails.talent || ''}
                                            onBlur={(e) => {
                                                if (e.target.value !== (workDetails.talent || '')) {
                                                    api.put(`/works/${workDetails.id}`, { talent: e.target.value });
                                                    setWorkDetails(prev => ({ ...prev, talent: e.target.value }));
                                                }
                                            }}
                                            placeholder="—"
                                        />
                                    ) : (
                                        <span className="text-gray-300">{workDetails.talent || '—'}</span>
                                    )}

                                    <span className="text-gray-500">Stylist:</span>
                                    {user && user.level === 'admin' ? (
                                        <input
                                            key={`stylist-${workDetails.id}`}
                                            type="text"
                                            className="bg-transparent text-gray-300 border-b border-transparent hover:border-gray-600 focus:border-gray-400 focus:outline-none transition-colors"
                                            defaultValue={workDetails.stylist || ''}
                                            onBlur={(e) => {
                                                if (e.target.value !== (workDetails.stylist || '')) {
                                                    api.put(`/works/${workDetails.id}`, { stylist: e.target.value });
                                                    setWorkDetails(prev => ({ ...prev, stylist: e.target.value }));
                                                }
                                            }}
                                            placeholder="—"
                                        />
                                    ) : (
                                        <span className="text-gray-300">{workDetails.stylist || '—'}</span>
                                    )}

                                    <span className="text-gray-500">Hair:</span>
                                    {user && user.level === 'admin' ? (
                                        <input
                                            key={`hair-${workDetails.id}`}
                                            type="text"
                                            className="bg-transparent text-gray-300 border-b border-transparent hover:border-gray-600 focus:border-gray-400 focus:outline-none transition-colors"
                                            defaultValue={workDetails.hair || ''}
                                            onBlur={(e) => {
                                                if (e.target.value !== (workDetails.hair || '')) {
                                                    api.put(`/works/${workDetails.id}`, { hair: e.target.value });
                                                    setWorkDetails(prev => ({ ...prev, hair: e.target.value }));
                                                }
                                            }}
                                            placeholder="—"
                                        />
                                    ) : (
                                        <span className="text-gray-300">{workDetails.hair || '—'}</span>
                                    )}

                                    <span className="text-gray-500">Makeup:</span>
                                    {user && user.level === 'admin' ? (
                                        <input
                                            key={`makeup-${workDetails.id}`}
                                            type="text"
                                            className="bg-transparent text-gray-300 border-b border-transparent hover:border-gray-600 focus:border-gray-400 focus:outline-none transition-colors"
                                            defaultValue={workDetails.makeup || ''}
                                            onBlur={(e) => {
                                                if (e.target.value !== (workDetails.makeup || '')) {
                                                    api.put(`/works/${workDetails.id}`, { makeup: e.target.value });
                                                    setWorkDetails(prev => ({ ...prev, makeup: e.target.value }));
                                                }
                                            }}
                                            placeholder="—"
                                        />
                                    ) : (
                                        <span className="text-gray-300">{workDetails.makeup || '—'}</span>
                                    )}
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="flex items-center justify-center h-full text-gray-600">
                            <div className="text-center">
                                <p className="text-lg mb-2">Select a work to view</p>
                                <p className="text-sm opacity-50">← Choose from the sidebar</p>
                            </div>
                        </div>
                    )
                }
            </div >

            {/* Admin Panel */}
            {showAdminPanel && (
                <AdminPanel
                    onClose={() => setShowAdminPanel(false)}
                    initialTab={adminPanelTab}
                />
            )}

            {/* Context Menu */}
            {
                contextMenu.visible && (
                    <div
                        className="fixed z-[100] bg-[#2a2a2a] border border-[#444] rounded shadow-xl py-1 w-48"
                        style={{ top: contextMenu.y, left: contextMenu.x }}
                    >
                        <button
                            onClick={handleRenameClick}
                            className="w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-[#3d3d3d] hover:text-white"
                        >
                            Rename
                        </button>
                        <button
                            onClick={handleDeleteClick}
                            className="w-full text-left px-4 py-2 text-sm text-red-500 hover:bg-[#3d3d3d] hover:text-red-400"
                        >
                            Delete
                        </button>
                    </div>
                )
            }

            {/* Rename Modal */}
            {
                showRenameModal && (
                    <div className="fixed inset-0 z-[110] bg-black/70 flex items-center justify-center p-4">
                        <div className="bg-[#2a2a2a] border border-[#444] rounded-lg shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
                            <h3 className="text-xl font-light text-white mb-4">Rename Work</h3>
                            <input
                                type="text"
                                className="w-full bg-[#1a1a1a] border border-[#444] text-white px-3 py-2 rounded focus:outline-none focus:border-red-500 mb-6"
                                value={renameValue}
                                onChange={e => setRenameValue(e.target.value)}
                                autoFocus
                            />
                            <div className="flex justify-end gap-3">
                                <button
                                    onClick={() => setShowRenameModal(false)}
                                    className="px-4 py-2 rounded text-gray-400 hover:text-white transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={submitRename}
                                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors"
                                >
                                    Save
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* New Work Modal */}
            {
                showNewWorkDialog && (
                    <div className="fixed inset-0 z-[110] bg-black/70 flex items-center justify-center p-4" onClick={() => setShowNewWorkDialog(false)}>
                        <div className="bg-[#2a2a2a] border border-[#444] rounded-lg shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
                            <h3 className="text-xl font-light text-white mb-4">New Work</h3>
                            <input
                                type="text"
                                placeholder="Enter work name..."
                                className="w-full bg-[#1a1a1a] border border-[#444] text-white px-3 py-2 rounded focus:outline-none focus:border-blue-500 mb-6"
                                value={newWorkName}
                                onChange={e => setNewWorkName(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleCreateWork()}
                                autoFocus
                            />
                            <div className="flex justify-end gap-3">
                                <button
                                    onClick={() => { setShowNewWorkDialog(false); setNewWorkName(''); }}
                                    className="px-4 py-2 rounded text-gray-400 hover:text-white transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleCreateWork}
                                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors"
                                >
                                    Create
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Delete Modal */}
            {
                showDeleteModal && (
                    <div className="fixed inset-0 z-[110] bg-black/70 flex items-center justify-center p-4">
                        <div className="bg-[#2a2a2a] border border-[#444] rounded-lg shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
                            <h3 className="text-xl font-light text-white mb-2">Delete Work?</h3>
                            <p className="text-gray-400 mb-6 text-sm">
                                Are you sure you want to delete <span className="text-white font-medium">"{contextMenu.work?.work_period}"</span>?
                                This action cannot be undone and will delete all associated files.
                            </p>
                            <div className="flex justify-end gap-3">
                                <button
                                    onClick={() => setShowDeleteModal(false)}
                                    className="px-4 py-2 rounded text-gray-400 hover:text-white transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={submitDelete}
                                    className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded transition-colors"
                                >
                                    Delete
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Delete Selected Files Modal */}
            {
                showDeleteConfirm && (
                    <div className="fixed inset-0 z-[110] bg-black/70 flex items-center justify-center p-4">
                        <div className="bg-[#2a2a2a] border border-[#444] rounded-lg shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
                            <h3 className="text-xl font-light text-white mb-2">Delete Selected Files?</h3>
                            <p className="text-gray-400 mb-6 text-sm">
                                Are you sure you want to delete <span className="text-white font-medium">{selectedFiles.size} files</span>?
                                This action cannot be undone.
                            </p>
                            <div className="flex justify-end gap-3">
                                <button
                                    onClick={() => setShowDeleteConfirm(false)}
                                    className="px-4 py-2 rounded text-gray-400 hover:text-white transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={confirmDelete}
                                    className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded transition-colors"
                                >
                                    Delete
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }
            {/* Download Progress Modal */}
            {
                downloadStatus && (
                    <div className="fixed inset-0 z-[110] bg-black/70 flex items-center justify-center p-4">
                        <div className="bg-[#2a2a2a] border border-[#444] rounded-lg shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
                            <h3 className="text-xl font-light text-white mb-4">
                                {downloadStatus.state === 'zipping' ? 'Preparing Archive...' : 'Downloading...'}
                            </h3>
                            {/* Progress Bar */}
                            <div className="w-full bg-[#1a1a1a] h-2 rounded-full overflow-hidden mb-2">
                                <div
                                    className="h-full bg-primary transition-all duration-300"
                                    style={{ width: `${downloadStatus.total > 0 ? (downloadStatus.current / downloadStatus.total) * 100 : 0}%` }}
                                ></div>
                            </div>
                            <span className="text-gray-400 text-sm block text-center mb-4">
                                {downloadStatus.current} / {downloadStatus.total} files zipped
                            </span>

                            <div className="flex justify-center">
                                <button
                                    onClick={handleCancelDownload}
                                    className="px-4 py-2 rounded text-red-500 hover:text-red-400 hover:bg-red-500/10 transition-colors text-sm"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }
            {/* Hidden Inputs for Upload */}
            <input
                type="file"
                multiple
                ref={fileInputRef}
                className="hidden"
                onChange={(e) => handleFileSelect(e.target.files)}
            />

            {/* Upload Progress Modal */}
            {
                uploading && (
                    <div className="fixed inset-0 z-[120] bg-black/80 flex items-center justify-center p-4">
                        <div className="bg-[#2a2a2a] border border-[#444] rounded-lg shadow-2xl w-full max-w-sm p-8 text-center">
                            <h3 className="text-2xl font-helvetica-light text-white mb-2">
                                {uploadTotalFiles > 1 ? `Progress: ${uploadCurrentIndex + 1} / ${uploadTotalFiles}` : 'Uploading...'}
                            </h3>

                            <p className="text-blue-400 text-sm mb-6 truncate px-4">
                                {uploadProgress < 100 ? `Uploading: ${currentUploadFile}` : `Processing: ${currentUploadFile}`}
                            </p>

                            <div className="w-full bg-gray-800 rounded-full h-2 mb-4 overflow-hidden">
                                <div
                                    className={`h-full transition-all duration-300 ease-out ${uploadProgress < 100 ? 'bg-blue-600' : 'bg-green-500 animate-pulse'}`}
                                    style={{
                                        width: uploadTotalFiles > 1
                                            ? `${((uploadCurrentIndex + (uploadProgress / 100)) / uploadTotalFiles) * 100}%`
                                            : `${uploadProgress}%`
                                    }}
                                ></div>
                            </div>

                            <div className="flex justify-between items-center text-sm text-gray-400 mb-2">
                                <span>{uploadProgress < 100 ? 'Uploading bits...' : 'Generating assets...'}</span>
                                <span className="text-white font-medium">
                                    {uploadTotalFiles > 0
                                        ? `${Math.round(((uploadCurrentIndex + (uploadProgress / 100)) / uploadTotalFiles) * 100)}%`
                                        : `${uploadProgress}%`}
                                </span>
                            </div>

                            <p className="text-xs text-gray-500 mt-6 leading-relaxed">
                                {uploadTotalFiles > 1
                                    ? "Bulk processing each file sequentially for quality."
                                    : "Processing previews and thumbnails. This may take a few moments."}
                            </p>
                        </div>
                    </div>
                )
            }

            {/* Select Work Reminder Modal */}
            {
                showSelectWorkDialog && (
                    <div className="fixed inset-0 z-[120] bg-black/80 flex items-center justify-center p-4" onClick={() => setShowSelectWorkDialog(false)}>
                        <div className="bg-[#2a2a2a] border border-[#444] rounded-lg shadow-2xl w-full max-w-sm p-8 text-center" onClick={e => e.stopPropagation()}>
                            <div className="w-16 h-16 bg-red-500/10 border border-red-500 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                            </div>
                            <h3 className="text-2xl font-helvetica-light text-white mb-4">No Work Selected</h3>
                            <p className="text-gray-400 mb-8 leading-relaxed">
                                Please select a work from the sidebar before attempting to add photos.
                            </p>
                            <button
                                onClick={() => setShowSelectWorkDialog(false)}
                                className="w-full py-3 bg-red-500 hover:bg-red-600 text-white font-bold rounded transition-colors"
                            >
                                Got it
                            </button>
                        </div>
                    </div>
                )
            }
        </div >
    );
};

export default Browser;
