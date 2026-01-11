import React, { memo } from 'react';

const SidebarItem = memo(({
    work,
    isSelected,
    isAdmin,
    previewMode,
    onSelect,
    onContextMenu,
    onToggleVisibility
}) => {
    // Helper to prevent propagation for visibility toggle
    const handleVisibilityClick = (e) => {
        e.stopPropagation();
        onToggleVisibility(e, work);
    };

    return (
        <button
            onClick={() => onSelect(work.id)}
            onContextMenu={(e) => onContextMenu(e, work)}
            className={`w-full tracking-wide text-left px-5 py-2 text-lg font-helvetica-light transition-colors truncate cursor-grab active:cursor-grabbing
                ${isSelected ? 'bg-[#2a2a2a] text-white border-l-2 border-white' : 'text-gray-400 hover:text-gray-200 hover:bg-[#252525]'}`}
        >
            <div className="flex items-center justify-between w-full">
                <span className="truncate flex-1">
                    {work.work_period || work.talent || work.path}
                </span>
                {isAdmin && !previewMode && (
                    <div
                        onClick={handleVisibilityClick}
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
    );
}, (prevProps, nextProps) => {
    // Custom comparison function for performance
    return (
        prevProps.isSelected === nextProps.isSelected &&
        prevProps.isAdmin === nextProps.isAdmin &&
        prevProps.previewMode === nextProps.previewMode &&
        prevProps.work === nextProps.work // Assumes work object reference changes only on update
    );
});

export default SidebarItem;
