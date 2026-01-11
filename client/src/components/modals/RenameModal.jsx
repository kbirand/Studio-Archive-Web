import React, { useState, useEffect } from 'react';

const RenameModal = ({ isOpen, onClose, onRename, initialValue }) => {
    const [value, setValue] = useState('');

    useEffect(() => {
        if (isOpen) {
            setValue(initialValue || '');
        }
    }, [isOpen, initialValue]);

    if (!isOpen) return null;

    const handleSubmit = () => {
        if (!value.trim()) return;
        onRename(value);
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') handleSubmit();
        if (e.key === 'Escape') onClose();
    };

    return (
        <div className="fixed inset-0 z-[110] bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-[#2a2a2a] border border-[#444] rounded-lg shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
                <h3 className="text-xl font-light text-white mb-4">Rename Work</h3>
                <input
                    type="text"
                    className="w-full bg-[#1a1a1a] border border-[#444] text-white px-3 py-2 rounded focus:outline-none focus:border-red-500 mb-6"
                    value={value}
                    onChange={e => setValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    autoFocus
                />
                <div className="flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 rounded text-gray-400 hover:text-white transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSubmit}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors"
                    >
                        Save
                    </button>
                </div>
            </div>
        </div>
    );
};

export default RenameModal;
