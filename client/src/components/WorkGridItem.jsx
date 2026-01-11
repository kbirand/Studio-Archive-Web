import React, { memo } from 'react';

const WorkGridItem = memo(({
    file,
    index,
    isSelected,
    isSelectionMode,
    isAdmin,
    previewMode,
    viewSettings,
    workPath,
    apiBase,
    onClick,
    onToggleVisibility,
    onDownloadOriginal
}) => {
    // Helper handlers
    const handleVisibilityClick = (e) => {
        e.stopPropagation();
        onToggleVisibility(e, file);
    };

    const handleDownloadClick = (e) => {
        onDownloadOriginal(e, file, workPath);
    };

    return (
        <div className={`relative w-full h-full ${isSelected ? 'ring-2 ring-primary' : ''}`}>
            <img
                src={`${apiBase}/api/assets?path=${encodeURIComponent(workPath)}&file=${encodeURIComponent(file.file)}&type=thumb`}
                alt={file.file}
                className={`w-full h-full object-cover pointer-events-none ${isSelected ? 'opacity-80' : ''}`}
                loading="lazy"
            />
            {/* Checkbox Overlay */}
            {isSelectionMode && (
                <div className="absolute top-2 left-2 z-20">
                    <div className={`w-5 h-5 rounded border border-white/50 flex items-center justify-center ${isSelected ? 'bg-primary border-primary' : 'bg-black/30'}`}>
                        {isSelected && (
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-white" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                        )}
                    </div>
                </div>
            )}

            {/* Admin Visibility Toggle (Files) */}
            {!isSelectionMode && !previewMode && isAdmin && (
                <div
                    className="absolute top-2 left-2 z-30 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={handleVisibilityClick}
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
            {!isSelectionMode && (
                <button
                    className="absolute top-2 right-2 p-1.5 bg-black/60 hover:bg-black/80 text-white rounded opacity-0 group-hover:opacity-100 transition-opacity z-10"
                    title="Download Original"
                    onClick={handleDownloadClick}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                </button>
            )}
        </div>
    );
}, (prevProps, nextProps) => {
    return (
        prevProps.file === nextProps.file &&
        prevProps.isSelected === nextProps.isSelected &&
        prevProps.isSelectionMode === nextProps.isSelectionMode &&
        prevProps.isAdmin === nextProps.isAdmin &&
        prevProps.previewMode === nextProps.previewMode &&
        prevProps.viewSettings.ratio === nextProps.viewSettings.ratio && // Only ratio affects inner render
        prevProps.workPath === nextProps.workPath
    );
});

export default WorkGridItem;
