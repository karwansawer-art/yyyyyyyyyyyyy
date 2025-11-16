import React from 'react';
import type { User } from 'firebase/auth';
import { CloseIcon, BookOpenIcon } from '../ui/Icons.tsx';

interface FreedomModelProgramProps {
    isOpen: boolean;
    onClose: () => void;
    user: User; // Prop is passed but not used in the new implementation
    isDeveloper: boolean; // Prop is passed but not used in the new implementation
}

const FreedomModelProgram: React.FC<FreedomModelProgramProps> = ({ isOpen, onClose }) => {
    if (!isOpen) return null;

    const freedomModelUrl = "https://namoothaj-5nds9uxr.manus.space/";

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
            <div 
                className="w-full max-w-md h-[90vh] bg-sky-950/90 border border-teal-700/50 rounded-lg flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                <header className="flex items-center justify-between p-4 border-b border-teal-400/30 flex-shrink-0">
                    <div className="flex items-center gap-3">
                        <BookOpenIcon className="w-6 h-6 text-teal-300" />
                        <h2 className="text-xl font-bold text-teal-200 text-shadow">برنامج نموذج الحرية</h2>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-white/10" aria-label="إغلاق">
                        <CloseIcon className="w-6 h-6" />
                    </button>
                </header>
                <main className="flex-grow overflow-hidden rounded-b-lg">
                    <iframe
                        src={freedomModelUrl}
                        title="برنامج نموذج الحرية"
                        className="w-full h-full border-0"
                    ></iframe>
                </main>
            </div>
        </div>
    );
};

export default FreedomModelProgram;
