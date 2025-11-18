import React from 'react';
import { CloseIcon } from '../ui/Icons.tsx';
import { CUSTOM_HABIT_ICONS } from '../habits/AddHabitModal.tsx';

interface BookIconPickerModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelectIcon: (icon: string) => void;
}

const BookIconPickerModal: React.FC<BookIconPickerModalProps> = ({ isOpen, onClose, onSelectIcon }) => {
    if (!isOpen) return null;

    const handleSelect = (icon: string) => {
        onSelectIcon(icon);
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[70] p-4" onClick={onClose}>
            <div 
                className="w-full max-w-md bg-sky-950/90 border border-sky-500/50 rounded-lg flex flex-col h-[80vh]"
                onClick={e => e.stopPropagation()}
            >
                <header className="flex items-center justify-between p-4 border-b border-sky-400/30 flex-shrink-0">
                    <h2 className="text-xl font-bold text-sky-200">اختر أيقونة للكتب</h2>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-white/10"><CloseIcon className="w-6 h-6" /></button>
                </header>
                <main className="p-4 overflow-y-auto">
                    <div className="grid grid-cols-5 gap-4">
                        {CUSTOM_HABIT_ICONS.map((icon, index) => (
                            <button 
                                key={index} 
                                onClick={() => handleSelect(icon)} 
                                className="aspect-square flex items-center justify-center text-4xl rounded-lg bg-sky-800/60 hover:bg-sky-700/80 transition-transform duration-200 hover:scale-110"
                            >
                                {icon}
                            </button>
                        ))}
                    </div>
                </main>
            </div>
        </div>
    );
};

export default BookIconPickerModal;
