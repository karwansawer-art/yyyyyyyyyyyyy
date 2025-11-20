
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import type { User } from 'firebase/auth';
import { collection, query, onSnapshot, doc, setDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db } from '../services/firebase.ts';
import type { FollowUpLog as IFollowUpLog, FollowUpStatus, UserProfile } from '../types.ts';
import { Spinner, PlusIcon } from './ui/Icons.tsx';
import { callGeminiAPI } from '../services/apiKeyManager.ts';

// --- گۆڕانکاری لێرەدایە: زیادکردنی ٢ مدربی نوێ ---
export type AnalyticalPersona = 
    | 'DataScientist'
    | 'BehavioralPsychologist'
    | 'PatienceAdvisor'
    | 'ToughLoveCoach'
    | 'EmpatheticPeer'
    | 'FamilyCounselor'
    | 'GratitudeAdvisor';
    
export interface PerformanceData {
    username: string;
    streak: number;
    lastStatus: 'success' | 'slip_up' | 'relapse' | 'absent';
    logHistory: { date: string; status: string; notes?: string }[];
    commonTriggers: string[];
}

// --- تعریفات الشخصيات والمنطق (زیادکردنی ٢ مدربی نوێ) ---
const GLOBAL_CONSTRAINTS = "تكلم بلهجة سعودية (نجدية) عامية بسيطة لا تستخدم ابدا اي حركات تشكيل او فواصل او نقاط او علامات ترقيم ولا تستخدم ابدا اي كلمات انجليزية كلامك لازم يكون موافق للمنهج السلفي ولا يخالفه ابدا";

async function getAnalysis(persona: AnalyticalPersona, data: PerformanceData): Promise<string> {
    let systemInstruction = '';
    
    let performanceDataString = '';
    try {
        performanceDataString = JSON.stringify(data, null, 2);
    } catch (e) {
        console.error("JSON stringify error in getAnalysis:", e);
        performanceDataString = "Error: Could not serialize data due to circular reference.";
    }

    const userPrompt = `
        حلل بيانات المستخدم هذي من زاويتك الخاصة
        ابي تحليل مفصل وطويل (ثلاث فقرات او اكثر)
        ابي نصيحة تملى العين وتكون تامة وكاملة
        ${performanceDataString}
    `;

    const commonRules = `
        لازم تحليلك ونصيحتك تكون طويلة جدا ومفصلة وتلامس الوضع من كل الجوانب
        مهم جدا تدخل في كلامك نصايح دينية وتذكير بالله والآخرة وتربطها بتحليلك الخاص فيك
    `;

    switch (persona) {
        case 'DataScientist':
            systemInstruction = `
                أنت "عالم بيانات" شغلك تحليل السلوك
                مهمتك تحلل بيانات المستخدم بارقام وحقائق
                ركز على الارقام والانماط والتكرار وكم مرة ينجح وكم مرة يزل
                استخدم لغة ارقام واضحة
                ${commonRules}
                ${GLOBAL_CONSTRAINTS}
            `;
            break;
        case 'BehavioralPsychologist':
            systemInstruction = `
                أنت "طبيب نفسي سلوكي"
                مهمتك تحلل الاسباب النفسية ورا سلوك المستخدم
                ركز على العادات والمحفزات اللي تخليه يزل والاستجابات
                عطه راي عن الدوافع السلوكية
                ${commonRules}
                ${GLOBAL_CONSTRAINTS}
            `;
            break;
        case 'PatienceAdvisor':
            systemInstruction = `
                أنت "ناصح بالصبر"
                مهمتك تذكير المستخدم بفضل الصبر والاحتساب عند الله
                شجعه يتحمل المشقة ويشوف التعافي رحلة تحتاج نفس طويل
                ذكره ان مع العسر يسرا
                لازم تحليلك ونصيحتك تكون طويلة جدا ومفصلة
                ${GLOBAL_CONSTRAINTS}
            `;
            break;
        case 'ToughLoveCoach':
            systemInstruction = `
                أنت "مدرب صارم"
                مهمتك تعطي تحليل صريح وواضح بس بدون اهانة
                ركز على تحمل المسؤولية والانضباط وانتبه للاعذار
                كن حازم وادفعه يكون احسن
                ${commonRules}
                ${GLOBAL_CONSTRAINTS}
            `;
            break;
        case 'EmpatheticPeer':
            systemInstruction = `
                أنت "رفيق متعافي" (واحد مر بنفس التجربة)
                مهمتك تحلل تجربة المستخدم من منظور واحد فاهم وعاش الوضع
                ركز على المشاعر والصعوبات اللي تمر عليه
                عطه كلام من نوع "انا حاس فيك" و "مريت باللي تمر فيه"
                ${commonRules}
                ${GLOBAL_CONSTRAINTS}
            `;
            break;
        
        // --- ٢ مدربی نوێ لێرە زیادکران ---
        case 'FamilyCounselor':
            systemInstruction = `
                أنت "ناصح أسري واجتماعي"
                مهمتك تحلل كيف سلوك المستخدم يأثر على أهله وعلاقاته
                ركز على أهمية بناء الثقة من جديد وبر الوالدين وصلة الرحم
                نصيحتك تكون عن إصلاح العلاقات اللي خربت
                ${commonRules}
                ${GLOBAL_CONSTRAINTS}
            `;
            break;
        case 'GratitudeAdvisor':
            systemInstruction = `
                أنت "الناصح بالشكر"
                مهمتك تذكير المستخدم بنعم الله عليه اللي ما تنعد
                ركز على شكر نعمة الصحة والعافية والفرصة للتوبة
                ذكره ان بالشكر تدوم النعم
                ${commonRules}
                ${GLOBAL_CONSTRAINTS}
            `;
            break;
    }
    
    return callGeminiAPI(systemInstruction, userPrompt);
}

// =================================================================
// --- دەستپێکی کۆدی ئەسڵی شاشەی بەدواداچوون (FollowUpScreen) ---
// =================================================================

// --- ئایکۆنی "مدرب" ---
const CoachIcon: React.FC<{ className?: string }> = ({ className = "w-6 h-6" }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 18.657A8 8 0 016.343 7.343m11.314 11.314a8 8 0 00-11.314-11.314m11.314 11.314L22 22M12 6V4M4 12H2m10 10v2m8-10h2M7 17l-2 2m12-12l2-2" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14a2 2 0 100-4 2 2 0 000 4z" />
    </svg>
);
// --- ئایکۆنی تیری dropdown ---
const ChevronDownIcon: React.FC<{ className?: string }> = ({ className = "w-6 h-6" }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
);


const getISODate = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};
const STATUS_CONFIG: { [key in FollowUpStatus]: { label: string; color: string; textColor: string; borderColor: string; emoji: string; gradient: string; } } = {
    relapse: { label: 'انتكاسة', color: 'bg-red-500/80', textColor: 'text-red-300', borderColor: 'border-red-500/50', emoji: '💔', gradient: 'from-red-500/20 to-transparent' },
    slip_up: { label: 'زلة', color: 'bg-orange-500/80', textColor: 'text-orange-300', borderColor: 'border-orange-500/50', emoji: '🚶‍♂️', gradient: 'from-orange-500/20 to-transparent' },
    success: { label: 'نجاح', color: 'bg-green-500/80', textColor: 'text-green-300', borderColor: 'border-green-500/50', emoji: '✅', gradient: 'from-green-500/20 to-transparent' },
    absent: { label: 'غائب', color: 'bg-yellow-500/80', textColor: 'text-yellow-300', borderColor: 'border-yellow-500/50', emoji: '❔', gradient: 'from-yellow-500/20 to-transparent' },
};

const SlipUpWarningModal: React.FC<{ onConfirm: () => void; onClose: () => void; }> = ({ onConfirm, onClose }) => (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60] p-4">
        <div className="w-full max-w-sm bg-sky-950 border border-yellow-500/50 rounded-lg p-6 space-y-4 text-white">
            <h3 className="text-xl font-bold text-yellow-400 text-center">تنبيه</h3>
            <p className="text-sky-200 text-center">انتبه، إذا تعرضت لزلة أخرى، سيتم تصفير عدادك وأوسمتك.</p>
            <div className="flex justify-center gap-4 pt-4">
                <button onClick={onClose} className="px-6 py-2 font-semibold text-white rounded-md bg-gray-600 hover:bg-gray-500">الغاء</button>
                <button onClick={onConfirm} className="px-6 py-2 font-semibold text-white rounded-md bg-yellow-600 hover:bg-yellow-500">متابعة</button>
            </div>
        </div>
    </div>
);
const SlipUpConfirmModal: React.FC<{ onConfirm: () => void; onClose: () => void; }> = ({ onConfirm, onClose }) => (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60] p-4">
        <div className="w-full max-w-sm bg-sky-950 border border-red-500/50 rounded-lg p-6 space-y-4 text-white">
            <h3 className="text-xl font-bold text-red-400 text-center">تأكيد الزلة</h3>
            <p className="text-sky-200 text-center">هل أنت متأكد من المتابعة؟ سيؤدي هذا إلى تصفير عدادك وأوسمتك.</p>
            <div className="flex justify-center gap-4 pt-4">
                <button onClick={onClose} className="px-6 py-2 font-semibold text-white rounded-md bg-gray-600 hover:bg-gray-500">الغاء</button>
                <button onClick={onConfirm} className="px-6 py-2 font-semibold text-white rounded-md bg-red-600 hover:bg-red-500">نعم، أؤكد</button>
            </div>
        </div>
    </div>
);

// --- شاشەی شیکاری "مدرب" (دیزاینی نوێی Dropdown) ---
// --- گۆڕانکاری لێرەدایە: زیادکردنی ٢ مدربی نوێ ---
const COACH_PERSONAS: { key: AnalyticalPersona; label: string; }[] = [
    { key: 'DataScientist', label: 'عالم البيانات' },
    { key: 'BehavioralPsychologist', label: 'الطبيب النفسي' },
    { key: 'PatienceAdvisor', label: 'الناصح بالصبر' },
    { key: 'ToughLoveCoach', label: 'المدرب الصارم' },
    { key: 'EmpatheticPeer', label: 'الرفيق المتعافي' },
    { key: 'FamilyCounselor', label: 'الناصح الأسري' },
    { key: 'GratitudeAdvisor', label: 'الناصح بالشكر' },
];

const CoachAnalysisModal: React.FC<{
    user: User;
    userProfile: UserProfile;
    logs: { [key: string]: IFollowUpLog };
    onClose: () => void;
}> = ({ user, userProfile, logs, onClose }) => {
    
    const [analysisText, setAnalysisText] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [selectedCoach, setSelectedCoach] = useState<AnalyticalPersona | ''>('');
    // --- گۆڕانکاری لێرەدایە: State بۆ کردنەوەی لیستەکە ---
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);

    const handleFetchAnalysis = useCallback(async () => {
        if (!selectedCoach) {
            setAnalysisText("الرجاء اختيار مدرب أولا");
            return;
        }
        setIsLoading(true);
        setAnalysisText(null);
        try {
            const sortedLogs = (Object.values(logs) as IFollowUpLog[]).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
            const lastLoggedDay = sortedLogs[0];
            const lastStatus = lastLoggedDay ? lastLoggedDay.status : 'absent';
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const startDate = userProfile.startDate ? new Date(userProfile.startDate) : new Date();
            startDate.setHours(0, 0, 0, 0);
            const streak = Math.max(0, Math.floor((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));

            // Sanitize data to ensure no circular references (e.g. Firestore objects) are passed
            const dataForAI: PerformanceData = {
                username: userProfile.displayName || user.email || "المتعافي",
                streak: streak,
                lastStatus: (typeof lastStatus === 'string' ? lastStatus : 'absent') as any,
                logHistory: sortedLogs.slice(0, 30).map(log => ({
                    date: getISODate(new Date(log.timestamp)),
                    status: typeof log.status === 'string' ? log.status : 'unknown',
                })),
                commonTriggers: [], 
            };
            const responseText = await getAnalysis(selectedCoach, dataForAI);
            setAnalysisText(responseText);
        } catch (error) {
            console.error("Error getting single analysis:", error);
            setAnalysisText("صارت مشكلة بالاتصال حاول مرة ثانية");
        } finally {
            setIsLoading(false);
        }
    }, [selectedCoach, user, userProfile, logs]);

    // --- گۆڕانکاری لێرەدایە: گرتنی ناوی مدربی هەڵبژێردراو بۆ پیشاندان ---
    const selectedCoachLabel = COACH_PERSONAS.find(c => c.key === selectedCoach)?.label || 'اختار المدرب...';

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[60] p-4" onClick={onClose}>
            <div 
                className="w-full max-w-sm h-[90vh] bg-sky-950 border border-sky-700/50 rounded-2xl shadow-2xl p-6 space-y-4 text-white flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex justify-between items-center flex-shrink-0">
                    <h3 className="text-xl font-bold text-sky-300 text-center">تحليل المدرب</h3>
                    <button onClick={onClose} className="text-sky-300 hover:text-white text-2xl">&times;</button>
                </div>
                
                {/* --- 1. بەشی هەڵبژاردن (دیزاینی نوێی Dropdown) --- */}
                <div className="flex-shrink-0 space-y-3 relative" style={{ direction: 'rtl' }}>
                    <label className="block text-sm font-medium text-sky-300">
                        اختار المدرب:
                    </label>
                    
                    {/* --- دوگمەی سەرەکی Dropdown --- */}
                    <button
                        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                        className="w-full p-3 flex justify-between items-center bg-sky-800 border border-sky-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                    >
                        <span className={selectedCoach ? 'text-white' : 'text-sky-300'}>
                            {selectedCoachLabel}
                        </span>
                        <ChevronDownIcon className={`w-5 h-5 text-sky-300 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
                    </button>
                    
                    {/* --- لیستی مدربـەکان (شاردراوە) --- */}
                    {isDropdownOpen && (
                        <div className="absolute w-full mt-1 bg-sky-900 border border-sky-700 rounded-lg max-h-60 overflow-y-auto z-10 shadow-lg">
                            {COACH_PERSONAS.map(persona => (
                                <button
                                    key={persona.key}
                                    onClick={() => {
                                        setSelectedCoach(persona.key);
                                        setIsDropdownOpen(false);
                                    }}
                                    className="w-full text-right p-3 hover:bg-sky-800 text-sky-200"
                                >
                                    {persona.label}
                                </button>
                            ))}
                        </div>
                    )}
                    
                    {/* دوگمەی "بدء" */}
                    <button
                        onClick={handleFetchAnalysis}
                        disabled={isLoading || !selectedCoach}
                        className={`w-full p-3 font-semibold rounded-lg transition-colors mt-3
                            ${isLoading ? 'bg-gray-500 text-gray-300' : 'bg-green-600 hover:bg-green-500 text-white'}
                            ${!selectedCoach ? 'bg-gray-700 text-gray-400 cursor-not-allowed' : ''}
                        `}
                    >
                        {isLoading ? <Spinner className="w-6 h-6 mx-auto" /> : 'بدء التحليل'}
                    </button>
                </div>
                
                {/* --- 2. بەشی پیشاندانی شیکاری (فۆنتی گەورە) --- */}
                <div className="flex-grow overflow-y-auto bg-black/20 rounded-lg p-4 mt-2" style={{ direction: 'rtl' }}>
                    {isLoading && (
                        <div className="flex justify-center items-center h-full">
                            <Spinner className="w-8 h-8 text-sky-400" />
                        </div>
                    )}
                    {!isLoading && !analysisText && (
                        <p className="text-sky-300 text-center opacity-70 pt-10">
                            اختار المدرب واضغط بدء عشان تشوف تحليله
                        </p>
                    )}
                    {analysisText && (
                        <p className="text-sky-200 whitespace-pre-wrap text-xl leading-relaxed">
                            {analysisText}
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
};
// --- کۆتایی شاشەی شیکاری "مدرب" ---


interface FollowUpScreenProps {
    user: User;
    userProfile: UserProfile;
}
const FollowUpScreen: React.FC<FollowUpScreenProps> = ({ user, userProfile }) => {
    const [logs, setLogs] = useState<{ [key: string]: IFollowUpLog }>({});
    const [loading, setLoading] = useState(true);
    const [currentDate, setCurrentDate] = useState(new Date());
    const [showLogModal, setShowLogModal] = useState(false);
    const [showRelapseConfirm, setShowRelapseConfirm] = useState(false);
    const [showSlipUpWarning, setShowSlipUpWarning] = useState(false);
    const [showSlipUpConfirm, setShowSlipUpConfirm] = useState(false);
    const [showCoachModal, setShowCoachModal] = useState(false);
    const [selectedDateForEdit, setSelectedDateForEdit] = useState<Date | null>(null);
    const backfillAttempted = useRef(false);

    useEffect(() => {
        backfillAttempted.current = false; // Reset on user change
        setLoading(true); // Set loading true on user change

        const q = query(collection(db, 'users', user.uid, 'followUpLogs'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetchedLogs: { [key: string]: IFollowUpLog } = {};
            snapshot.forEach(doc => {
                const data = doc.data();
                if (data.timestamp && typeof (data.timestamp as Timestamp).toDate === 'function') {
                    fetchedLogs[doc.id] = { status: data.status, timestamp: (data.timestamp as Timestamp).toDate() };
                }
            });
            setLogs(fetchedLogs);
            setLoading(false);
        }, (error) => {
            console.error("Error fetching follow-up logs:", error);
            setLoading(false);
        });
        return () => unsubscribe();
    }, [user]);

    useEffect(() => {
        if (loading || backfillAttempted.current) return;

        const counterStartDate = userProfile?.startDate ? new Date(userProfile.startDate) : null;
        if (!counterStartDate) return;
        counterStartDate.setHours(0, 0, 0, 0);

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        if (counterStartDate >= today) return;

        let currentDateIter = new Date(counterStartDate);
        const logsToCreate: { [key: string]: IFollowUpLog } = {};

        while (currentDateIter < today) {
            const dateKey = getISODate(currentDateIter);
            if (!logs[dateKey]) {
                logsToCreate[dateKey] = { status: 'absent', timestamp: new Date(currentDateIter) };
            }
            currentDateIter.setDate(currentDateIter.getDate() + 1);
        }

        const keys = Object.keys(logsToCreate);
        if (keys.length > 0) {
            const promises = keys.map(dateKey => {
                const logRef = doc(db, 'users', user.uid, 'followUpLogs', dateKey);
                return setDoc(logRef, { status: 'absent', timestamp: Timestamp.fromDate(logsToCreate[dateKey].timestamp) });
            });
            Promise.all(promises).catch(error => {
                console.error("Failed to backfill absent logs:", error);
            });
        }
        backfillAttempted.current = true;
    }, [logs, loading, user, userProfile]);


    const sessionStats = useMemo(() => {
        const counts: { [key in FollowUpStatus]: number } = { relapse: 0, slip_up: 0, success: 0, absent: 0 };
        const startDate = userProfile?.startDate ? new Date(userProfile.startDate) : null;
        if (startDate) { startDate.setHours(0, 0, 0, 0); }
        (Object.values(logs) as IFollowUpLog[]).forEach((log) => {
            if (log) {
                const logDate = new Date(log.timestamp);
                logDate.setHours(0,0,0,0);
                if (!startDate || logDate >= startDate) {
                    if (log.status && counts.hasOwnProperty(log.status)) { counts[log.status]++; }
                }
            }
        });
        return counts;
    }, [logs, userProfile?.startDate]);
    
    const totalStats = useMemo(() => {
        const totalCounts: { [key in FollowUpStatus]: number } = { relapse: 0, slip_up: 0, success: 0, absent: 0 };
        (Object.values(logs) as IFollowUpLog[]).forEach((log) => {
            if (log && log.status && totalCounts.hasOwnProperty(log.status)) { totalCounts[log.status]++; }
        });
        return totalCounts;
    }, [logs]);

    const handleLogStatus = async (status: FollowUpStatus) => {
        setShowLogModal(false);
        if (status === 'relapse') { setShowRelapseConfirm(true); return; }
        if (status === 'slip_up') {
            if (sessionStats.slip_up > 0) { setShowSlipUpConfirm(true); }
            else { setShowSlipUpWarning(true); }
            return;
        }
        
        // Determine if we are logging for today or a selected past date
        const targetDate = selectedDateForEdit || new Date();
        const dateKey = getISODate(targetDate);
        
        const logRef = doc(db, 'users', user.uid, 'followUpLogs', dateKey);
        try { 
            await setDoc(logRef, { status, timestamp: selectedDateForEdit ? Timestamp.fromDate(selectedDateForEdit) : serverTimestamp() }, { merge: true }); 
        }
        catch (error) { console.error("Error logging status:", error); }
        
        // Reset selected date
        setSelectedDateForEdit(null);
    };
    
    const handleConfirmRelapse = async () => {
        setShowRelapseConfirm(false);
        // If a past date was selected, use it as the new start date. Otherwise use now.
        const newStartDate = selectedDateForEdit || new Date();
        try {
            const dateKey = getISODate(newStartDate);
            const logRef = doc(db, 'users', user.uid, 'followUpLogs', dateKey);
            
            // If it's a past date, use Timestamp.fromDate, else serverTimestamp
            const timestampValue = selectedDateForEdit ? Timestamp.fromDate(selectedDateForEdit) : serverTimestamp();
            
            await setDoc(logRef, { status: 'relapse', timestamp: timestampValue }, { merge: true });
            const userDocRef = doc(db, 'users', user.uid);
            await setDoc(userDocRef, { startDate: newStartDate }, { merge: true });

            for (const key in localStorage) {
                if (key.startsWith(`celebrated_${user.uid}_`)) { localStorage.removeItem(key); }
            }
        } catch (error) { console.error("Error confirming relapse:", error); }
        
        setSelectedDateForEdit(null);
    };
    
    const handleFirstSlipUp = async () => {
        setShowSlipUpWarning(false);
        const targetDate = selectedDateForEdit || new Date();
        const dateKey = getISODate(targetDate);
        const logRef = doc(db, 'users', user.uid, 'followUpLogs', dateKey);
        
        const timestampValue = selectedDateForEdit ? Timestamp.fromDate(selectedDateForEdit) : serverTimestamp();

        try { 
            await setDoc(logRef, { status: 'slip_up', timestamp: timestampValue }, { merge: true }); 
        }
        catch (error) { console.error("Error logging first slip-up:", error); }
        
        setSelectedDateForEdit(null);
    };

    const handleConfirmSlipUpReset = async () => {
        setShowSlipUpConfirm(false);
        const newStartDate = selectedDateForEdit || new Date();
        try {
            const dateKey = getISODate(newStartDate);
            const logRef = doc(db, 'users', user.uid, 'followUpLogs', dateKey);
            
            const timestampValue = selectedDateForEdit ? Timestamp.fromDate(selectedDateForEdit) : serverTimestamp();

            await setDoc(logRef, { status: 'slip_up', timestamp: timestampValue }, { merge: true });
            const userDocRef = doc(db, 'users', user.uid);
            await setDoc(userDocRef, { startDate: newStartDate }, { merge: true });
            for (const key in localStorage) {
                if (key.startsWith(`celebrated_${user.uid}_`)) { localStorage.removeItem(key); }
            }
        } catch (error) { console.error("Error confirming slip-up reset:", error); }
        
        setSelectedDateForEdit(null);
    };
    
    const changeMonth = (amount: number) => {
        setCurrentDate(prev => {
            const newDate = new Date(prev);
            newDate.setDate(1); 
            newDate.setMonth(newDate.getMonth() + amount);
            return newDate;
        });
    };

    const handleDayClick = (day: Date) => {
        // Allow selecting today or past dates
        const today = new Date();
        today.setHours(23, 59, 59, 999); // End of today to ensure today is included
        if (day <= today) {
            setSelectedDateForEdit(day);
            setShowLogModal(true);
        }
    };

    const calendarDays = useMemo(() => {
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        const firstDayOfMonth = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const days: (Date | null)[] = [];
        for (let i = 0; i < firstDayOfMonth; i++) { days.push(null); }
        for (let i = 1; i <= daysInMonth; i++) { days.push(new Date(year, month, i)); }
        return days;
    }, [currentDate]);

    return (
        <div className="text-white pb-24">
            <header className="fixed top-0 left-1/2 -translate-x-1/2 w-full max-w-sm z-10 flex justify-center items-center p-4 bg-sky-950/80 backdrop-blur-sm">
                <h1 className="text-3xl font-bold text-white text-shadow">المتابعة</h1>
            </header>
            
            <main className="space-y-8 pt-20 px-4">
                <section>
                    <h2 className="text-xl font-bold text-sky-200 text-center mb-4">ملخص المتابعة (الإجمالي)</h2>
                    {loading ? <Spinner className="w-8 h-8 mx-auto text-sky-400" /> : (
                        <div className="grid grid-cols-2 gap-4">
                            {(Object.keys(STATUS_CONFIG) as FollowUpStatus[]).map(status => {
                                const config = STATUS_CONFIG[status];
                                return (
                                    <div key={status} className={`group relative p-4 rounded-xl shadow-lg overflow-hidden transition-transform hover:scale-105 bg-sky-950/50 backdrop-blur-sm border ${config.borderColor}`}>
                                        <div className={`absolute inset-0 bg-gradient-to-br ${config.gradient} opacity-50 group-hover:opacity-70 transition-opacity`}></div>
                                        <div className="relative flex justify-between items-center">
                                            <div>
                                                <p className="text-4xl font-bold text-white">{totalStats[status]}</p>
                                                <p className={`text-sm font-semibold ${config.textColor}`}>{config.label}</p>
                                            </div>
                                            <span className="text-5xl opacity-80 group-hover:opacity-100 group-hover:scale-110 transition-all duration-300">{config.emoji}</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </section>

                <section className="bg-sky-950/40 backdrop-blur-sm border border-sky-800/60 rounded-xl p-4">
                    <div className="flex justify-between items-center mb-4">
                        <button onClick={() => changeMonth(-1)} className="p-2 rounded-full hover:bg-white/10 text-xl font-bold">‹</button>
                        <div className="flex flex-col items-center">
                            <h2 className="text-lg font-semibold text-sky-200">{currentDate.toLocaleString('ar-EG', { month: 'long', year: 'numeric' })}</h2>
                             <button onClick={() => setCurrentDate(new Date())} className="text-xs font-semibold text-sky-300 hover:text-white hover:underline">
                                العودة لليوم
                            </button>
                        </div>
                        <button onClick={() => changeMonth(1)} className="p-2 rounded-full hover:bg-white/10 text-xl font-bold">›</button>
                    </div>
                    <div className="grid grid-cols-7 gap-1 text-center text-xs font-bold text-sky-400 mb-2 tracking-wider">
                        {['ح', 'ن', 'ث', 'ر', 'خ', 'ج', 'س'].map(day => <div key={day}>{day}</div>)}
                    </div>
                    <div className="grid grid-cols-7 gap-1">
                        {calendarDays.map((day, index) => {
                           if (!day) return <div key={`empty-${index}`} className="h-10 w-10"/>;
                            const todayKey = getISODate(new Date());
                            const dateKey = getISODate(day);
                            const log = logs[dateKey];
                            const isToday = dateKey === todayKey;
                            const startDate = userProfile?.startDate ? new Date(userProfile.startDate) : null;
                            const isPast = dateKey < todayKey && startDate && day >= startDate;
                            const statusToUse = log ? log.status : (isPast ? 'absent' : null);
                            
                            // Determine styling based on status or if interactive
                            const isFuture = day > new Date();
                            const dayContainerClasses = [
                                'h-10 w-10 flex items-center justify-center rounded-full transition-all duration-200 relative',
                                !isFuture ? 'cursor-pointer hover:scale-110 hover:shadow-md' : 'opacity-50 cursor-default'
                            ];
                            
                            const dayTextClasses = ['text-sm font-semibold'];
                            
                            if (statusToUse) {
                                dayContainerClasses.push(STATUS_CONFIG[statusToUse].color);
                                dayTextClasses.push('text-white');
                            } else if (isToday) {
                                dayContainerClasses.push('bg-sky-400');
                                dayTextClasses.push('text-sky-950');
                            } else {
                                dayTextClasses.push('text-sky-200');
                                if (!isFuture) {
                                    dayContainerClasses.push('hover:bg-sky-800/50');
                                }
                            }
                            return (
                                <div 
                                    key={dateKey} 
                                    className={dayContainerClasses.join(' ')}
                                    onClick={() => !isFuture && handleDayClick(day)}
                                >
                                    <span className={dayTextClasses.join(' ')}>{day.getDate()}</span>
                                    {!isFuture && !statusToUse && !isToday && (
                                        <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-sky-400/50 rounded-full"></span>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                    <div className="mt-4 pt-3 border-t border-sky-700/50 flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs">
                        {(Object.keys(STATUS_CONFIG) as FollowUpStatus[]).map(status => {
                            const config = STATUS_CONFIG[status];
                            return (
                                <div key={status} className="flex items-center gap-2">
                                    <div className={`w-3.5 h-3.5 rounded-full ${config.color}`}></div>
                                    <span className={config.textColor}>{config.label}</span>
                                </div>
                            );
                        })}
                    </div>
                </section>
            </main>

            {/* --- مۆداڵی شیکاری "مدرب" --- */}
            {showCoachModal && (
                <CoachAnalysisModal 
                    user={user}
                    userProfile={userProfile}
                    logs={logs}
                    onClose={() => setShowCoachModal(false)} 
                />
            )}
            
            {showLogModal && (
                <div 
                    className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-end justify-center z-50 transition-opacity" 
                    onClick={() => {
                        setShowLogModal(false);
                        setSelectedDateForEdit(null); // Reset if closed without selecting
                    }}
                >
                    <div 
                        className="w-full max-w-md bg-sky-950/90 border-t-2 border-sky-500/50 rounded-t-2xl p-6 space-y-4" 
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h2 className="text-xl font-semibold text-sky-200 text-center mb-4">
                             {selectedDateForEdit 
                                ? `تحديد حالة يوم ${selectedDateForEdit.toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long' })}` 
                                : "كيف كان يومك اليوم؟"}
                        </h2>
                        <div className="grid grid-cols-3 gap-4">
                            {(Object.keys(STATUS_CONFIG) as FollowUpStatus[])
                                .filter(status => status !== 'absent')
                                .map(status => {
                                    const config = STATUS_CONFIG[status];
                                    return (
                                        <button
                                            key={status}
                                            onClick={() => handleLogStatus(status)}
                                            className={`p-4 rounded-lg text-center font-bold transition-all duration-200 border-2 border-transparent ${config.color.replace('/80', '/40')} hover:${config.color.replace('/80', '/60')}`}
                                        >
                                            {config.label}
                                        </button>
                                    );
                                })}
                        </div>
                    </div>
                </div>
            )}
            
            {showRelapseConfirm && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60] p-4">
                    <div className="w-full max-w-sm bg-sky-950 border border-yellow-500/50 rounded-lg p-6 space-y-4 text-white">
                        <h3 className="text-xl font-bold text-yellow-400 text-center">تأكيد الانتكاسة</h3>
                        <p className="text-sky-200 text-center">هل أنت متأكد؟ سيؤدي هذا إلى تصفير عداد الأيام الخاص بك وبدء العد من جديد {selectedDateForEdit ? 'من التاريخ المحدد' : ''}.</p>
                        <div className="flex justify-center gap-4 pt-4">
                            <button onClick={() => { setShowRelapseConfirm(false); setSelectedDateForEdit(null); }} className="px-6 py-2 font-semibold text-white rounded-md bg-gray-600 hover:bg-gray-500">إلغاء</button>
                            <button onClick={handleConfirmRelapse} className="px-6 py-2 font-semibold text-white rounded-md bg-yellow-600 hover:bg-yellow-500">نعم، أؤكد</button>
                        </div>
                    </div>
                </div>
            )}

            {showSlipUpWarning && <SlipUpWarningModal onConfirm={handleFirstSlipUp} onClose={() => { setShowSlipUpWarning(false); setSelectedDateForEdit(null); }} />}
            {showSlipUpConfirm && <SlipUpConfirmModal onConfirm={handleConfirmSlipUpReset} onClose={() => { setShowSlipUpConfirm(false); setSelectedDateForEdit(null); }} />}

            {/* دوگمەی ئەسڵی '+' */}
            <button
                onClick={() => {
                    setSelectedDateForEdit(null); // Ensure we are logging for today
                    setShowLogModal(true);
                }}
                className="fixed z-40 left-6 bottom-20 w-16 h-16 rounded-full flex items-center justify-center bg-gradient-to-br from-teal-500 to-sky-600 text-white shadow-lg hover:scale-110 transition-transform duration-300 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-sky-950/50 focus:ring-teal-400"
                aria-label="تسجيل حالة اليوم"
            >
                <PlusIcon className="w-8 h-8" />
            </button>

            {/* --- دوگمەی "مدرب" --- */}
            <button
                onClick={() => setShowCoachModal(true)}
                className="fixed z-40 right-6 bottom-20 w-16 h-16 rounded-full flex items-center justify-center bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-lg hover:scale-110 transition-transform duration-300 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-sky-950/50 focus:ring-indigo-400"
                aria-label="تحليل المدرب"
            >
                <CoachIcon className="w-8 h-8" />
            </button>
        </div>
    );
};

export default FollowUpScreen;
