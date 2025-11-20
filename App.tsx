import React, { useState, useEffect, useRef } from 'react';
import { onAuthStateChanged, User, signOut, signInAnonymously, updateProfile } from 'firebase/auth';
import { doc, onSnapshot, getDoc, setDoc, serverTimestamp, Timestamp, deleteField, updateDoc } from 'firebase/firestore';
import { auth, db } from './services/firebase.ts';
import type { UserProfile } from './types.ts';
import Auth from './components/Auth.tsx';
import MainScreen from './components/MainScreen.tsx';
import { Spinner } from './components/ui/Icons.tsx';
import PinLock from './components/ui/PinLock.tsx';
import { AVATAR_OPTIONS } from './components/ui/AvatarPickerModal.tsx';

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  
  // تحديث منطق appLocked للتحقق من أن رمز PIN موجود وغير فارغ
  const [appLocked, setAppLocked] = useState(() => {
    const storedPin = localStorage.getItem("appLockPin");
    return !!storedPin && storedPin.trim() !== "";
  });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      if (user) {
        const userDocRef = doc(db, 'users', user.uid);
        
        const unsubscribeProfile = onSnapshot(userDocRef, (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data();

            // --- Robust Date Parsing Logic (Fix for Resetting Issue) ---
            const getFirestoreDate = (field: any): Date | undefined => {
                if (!field) return undefined;
                // Handle Firestore Timestamp
                if (typeof field.toDate === 'function') {
                    return field.toDate();
                }
                // Handle Standard JS Date
                if (field instanceof Date) {
                    return field;
                }
                // Handle String (ISO or other formats)
                if (typeof field === 'string') {
                    const d = new Date(field);
                    return isNaN(d.getTime()) ? undefined : d;
                }
                // Handle Number (Timestamp in milliseconds)
                if (typeof field === 'number') {
                    return new Date(field);
                }
                return undefined;
            };

            const firestoreStartDate = getFirestoreDate(data.startDate);
            let finalStartDate: Date | undefined = firestoreStartDate;
            let sourcedFromCache = false;

            // If Firestore data is missing startDate or invalid, check localStorage as a safety net.
            if (!finalStartDate) {
                try {
                    const cachedStartDate = localStorage.getItem(`user_startDate_${user.uid}`);
                    if (cachedStartDate) {
                        const cachedDate = new Date(cachedStartDate);
                        // Check if the cached date is valid before using it
                        if (!isNaN(cachedDate.getTime())) {
                            console.warn("Recovered startDate from localStorage due to missing/invalid Firestore data.");
                            finalStartDate = cachedDate;
                            sourcedFromCache = true; // Mark that we got it from the cache
                        }
                    }
                } catch (e) {
                    console.error("Failed to read startDate from localStorage", e);
                }
            }
            
            // If we have a valid startDate...
            if (finalStartDate) {
                // ...and it came from the cache (meaning Firestore is out of sync or empty), write it back to Firestore.
                if (sourcedFromCache) {
                    console.log("Restoring startDate to Firestore from local cache to fix account.");
                    updateDoc(userDocRef, { startDate: finalStartDate }).catch(error => {
                        console.error("Failed to restore startDate to Firestore:", error);
                    });
                }
                
                // Always update the local cache to ensure it's the latest known value.
                try {
                    localStorage.setItem(`user_startDate_${user.uid}`, finalStartDate.toISOString());
                } catch (e) {
                    console.error("Failed to write startDate to localStorage", e);
                }
            }

            // Auto-assign an avatar if one doesn't exist for a signed-in user
            if (!data.photoURL) {
                // Assign a default avatar deterministically based on UID
                const avatarIndex = user.uid.charCodeAt(0) % AVATAR_OPTIONS.length;
                const defaultAvatarUrl = AVATAR_OPTIONS[avatarIndex];
                
                // Update Firebase Auth and Firestore in the background
                Promise.all([
                    updateProfile(user, { photoURL: defaultAvatarUrl }),
                    updateDoc(userDocRef, { photoURL: defaultAvatarUrl })
                ]).catch(error => {
                    console.error("Failed to auto-assign avatar:", error);
                });
                
                // Set photoURL on the local profile data immediately for UI update
                data.photoURL = defaultAvatarUrl; 
            }
            
            // Auto-assign a counter image if one doesn't exist
            if (!data.counterImage) {
                // Assign a default counter image deterministically based on UID
                // Use a different character index from photoURL to reduce chance of same image
                const counterImageIndex = (user.uid.charCodeAt(1) || 0) % AVATAR_OPTIONS.length;
                const defaultCounterImage = AVATAR_OPTIONS[counterImageIndex];
                
                // Update Firestore in the background
                updateDoc(userDocRef, { counterImage: defaultCounterImage }).catch(error => {
                    console.error("Failed to auto-assign counter image:", error);
                });
                
                // Set counterImage on the local profile data immediately for UI update
                data.counterImage = defaultCounterImage; 
            }
            
            const profileData: UserProfile = {
              uid: user.uid,
              displayName: data.displayName,
              email: data.email,
              photoURL: data.photoURL,
              createdAt: (data.createdAt as Timestamp)?.toDate() || new Date(), // Convert Timestamp to Date
              startDate: finalStartDate, // Use the potentially cached value
              counterImage: data.counterImage,
              isAdmin: data.isAdmin ?? false,
              isMuted: data.isMuted ?? false,
              role: data.role ?? undefined,
              commitmentDocument: data.commitmentDocument ?? "",
              blockedUsers: data.blockedUsers ?? [],
              emergencyIndex: data.emergencyIndex ?? 0,
              urgeIndex: data.urgeIndex ?? 0,
              storyIndex: data.storyIndex ?? 0,
              // Journal entries, habits, and follow-up logs are handled by separate sub-collections/state.
            };
            setUserProfile(profileData);
            setLoading(false);
          } else {
            const newProfileData = {
              displayName: user.isAnonymous 
                ? `زائر ${user.uid.substring(0, 5)}` 
                : (user.displayName || "مستخدم جديد"),
              createdAt: serverTimestamp(),
              isAdmin: false,
              isMuted: false,
              role: null,
              commitmentDocument: "",
              blockedUsers: [],
              emergencyIndex: 0,
              urgeIndex: 0,
              storyIndex: 0,
              ...(user.email && { email: user.email }),
              ...(user.photoURL && { photoURL: user.photoURL }),
            };
            
            setDoc(userDocRef, newProfileData).catch(error => {
              console.error("Failed to create user profile:", error);
              setLoading(false);
            });
          }
        }, (error) => {
          console.error("Error in profile snapshot listener:", error);
          setLoading(false);
        });

        return () => unsubscribeProfile();
      } else {
        setUserProfile(null);
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const handleGuestLogin = async () => {
    try {
      setLoading(true);
      await signInAnonymously(auth);
    } catch (error) {
      console.error("Guest login failed:", error);
      setLoading(false); // التأكد من إيقاف التحميل عند الخطأ
    }
  };
  
  const handleSignOut = async () => {
    try {
      await signOut(auth);
      // سيتم التعامل مع setUser(null) بواسطة onAuthStateChanged
    } catch (error) {
      console.error("Error signing out: ", error);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center p-4">
        <Spinner className="w-16 h-16 text-sky-400" />
      </main>
    );
  }

  if (appLocked) {
    return <PinLock onUnlock={() => setAppLocked(false)} />;
  }

  return (
     <main className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {user && userProfile ? (
          <MainScreen user={user} userProfile={userProfile} handleSignOut={handleSignOut} setAppLocked={setAppLocked} />
        ) : (
          <Auth handleGuestLogin={handleGuestLogin} />
        )}
      </div>
    </main>
  );
};

export default App;