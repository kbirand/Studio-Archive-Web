import React, { useState } from 'react';

const NewWorkModal = ({ isOpen, onClose, onCreate }) => {
    const [name, setName] = useState('');

    if (!isOpen) return null;

    const handleSubmit = () => {
        if (!name.trim()) {
            alert("Please enter a work name");
            return;
        }
        onCreate(name);
        setName('');
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') handleSubmit();
        if (e.key === 'Escape') {
            setName('');
            onClose();
        }
    };

    return (
        <div className="fixed inset-0 z-[110] bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-[#2a2a2a] border border-[#444] rounded-lg shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
                <h3 className="text-xl font-light text-white mb-4">New Work</h3>
                <input
                    type="text"
                    placeholder="Enter work name..."
                    className="w-full bg-[#1a1a1a] border border-[#444] text-white px-3 py-2 rounded focus:outline-none focus:border-blue-500 mb-6"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    onKeyDown={handleKeyDown}
                    autoFocus
                />
                <div className="flex justify-end gap-3">
                    <button
                        onClick={() => { setName(''); onClose(); }}
                        className="px-4 py-2 rounded text-gray-400 hover:text-white transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSubmit}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors"
                    >
                        Create
                    </button>
                </div>
            </div>
        </div>
    );
};

export default NewWorkModal;
