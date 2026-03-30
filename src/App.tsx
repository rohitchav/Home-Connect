import React, { useState, useEffect, useMemo } from 'react';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut, 
  User as FirebaseUser 
} from 'firebase/auth';
import { 
  doc, 
  getDoc, 
  setDoc, 
  onSnapshot, 
  collection, 
  addDoc, 
  query, 
  where, 
  orderBy, 
  updateDoc, 
  deleteDoc,
  Timestamp
} from 'firebase/firestore';
import { auth, db } from './firebase';
import { translations } from './translations';
import { 
  LayoutDashboard, 
  PlusCircle, 
  HandCoins, 
  Settings, 
  LogOut, 
  Globe, 
  ChevronRight, 
  ChevronLeft,
  TrendingUp, 
  TrendingDown, 
  Wallet, 
  AlertTriangle, 
  CheckCircle2,
  Users,
  Copy,
  Plus,
  Trash2,
  Calendar,
  Moon,
  Sun
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell 
} from 'recharts';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// --- Utilities ---
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Types ---
type Language = 'mr' | 'en';
type View = 'dashboard' | 'transactions' | 'private' | 'settings' | 'history';

interface UserProfile {
  uid: string;
  name: string;
  familyId: string;
  role: 'admin' | 'member';
  email: string;
}

interface Family {
  id: string;
  name: string;
  adminUid: string;
  budget: number;
  savingsGoal: string;
  savingsGoalAmount: number;
  currentSavings: number;
  categories?: string[];
  lastProcessedMonth?: string;
  carryForwardBalance?: number;
}

interface Transaction {
  id: string;
  uid: string;
  userName: string;
  amount: number;
  type: 'income' | 'expense';
  category: string;
  date: string;
  notes: string;
  isRecurring: boolean;
}

interface PrivateLoan {
  id: string;
  personName: string;
  amount: number;
  type: 'lent' | 'borrowed';
  status: 'pending' | 'returned';
  date: string;
  notes: string;
}

interface MonthlyReport {
  id: string;
  month: string;
  totalIncome: number;
  totalExpense: number;
  balance: number;
  categoryBreakdown: Record<string, number>;
  memberContributions: Record<string, { income: number, expense: number }>;
  loanSummary: {
    lent: number;
    borrowed: number;
    returned: number;
    pending: number;
  };
}

// --- Components ---

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [family, setFamily] = useState<Family | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [privateLoans, setPrivateLoans] = useState<PrivateLoan[]>([]);
  const [familyMembers, setFamilyMembers] = useState<UserProfile[]>([]);
  const [archives, setArchives] = useState<MonthlyReport[]>([]);
  const [isArchiving, setIsArchiving] = useState(false);
  const [selectedReport, setSelectedReport] = useState<MonthlyReport | null>(null);
  
  const [lang, setLang] = useState<Language>(() => {
    const saved = localStorage.getItem('lang');
    return (saved as Language) || 'mr';
  });
  const [view, setView] = useState<View>('dashboard');
  const [loading, setLoading] = useState(true);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showJoinForm, setShowJoinForm] = useState(false);
  const [familyNameInput, setFamilyNameInput] = useState('');
  const [familyIdInput, setFamilyIdInput] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error', msg: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem('darkMode');
    return saved === 'true';
  });

  const t = translations[lang];

  // --- Effects ---

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('darkMode', darkMode.toString());
  }, [darkMode]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setIsAuthReady(true);
      if (u) {
        // Fetch profile
        const userDoc = await getDoc(doc(db, 'users', u.uid));
        if (userDoc.exists()) {
          setProfile(userDoc.data() as UserProfile);
        } else {
          setProfile(null);
        }
      } else {
        setProfile(null);
        setFamily(null);
        setTransactions([]);
        setPrivateLoans([]);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (profile?.familyId) {
      // Listen to family
      const unsubFamily = onSnapshot(doc(db, 'families', profile.familyId), (s) => {
        if (s.exists()) {
          setFamily({ id: s.id, ...s.data() } as Family);
        }
      });

      // Listen to transactions
      const q = query(
        collection(db, 'families', profile.familyId, 'transactions'),
        orderBy('date', 'desc')
      );
      const unsubTransactions = onSnapshot(q, (s) => {
        setTransactions(s.docs.map(d => ({ id: d.id, ...d.data() } as Transaction)));
      });

      // Listen to family members
      const qMembers = query(
        collection(db, 'users'),
        where('familyId', '==', profile.familyId)
      );
      const unsubMembers = onSnapshot(qMembers, (s) => {
        setFamilyMembers(s.docs.map(d => ({ uid: d.id, ...d.data() } as UserProfile)));
      });

      // Listen to archives
      const qArchives = query(
        collection(db, 'families', profile.familyId, 'archives'),
        orderBy('month', 'desc')
      );
      const unsubArchives = onSnapshot(qArchives, (s) => {
        setArchives(s.docs.map(d => ({ id: d.id, ...d.data() } as MonthlyReport)));
      });

      return () => {
        unsubFamily();
        unsubTransactions();
        unsubMembers();
        unsubArchives();
      };
    }
  }, [profile?.familyId]);

  useEffect(() => {
    const checkMonthEnd = async () => {
      if (!family || profile?.role !== 'admin' || isArchiving) return;

      const now = new Date();
      const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      
      // If lastProcessedMonth is missing, initialize it to current month (don't archive anything yet)
      if (!family.lastProcessedMonth) {
        await updateFamilySettings({ lastProcessedMonth: currentMonthStr });
        return;
      }

      if (family.lastProcessedMonth !== currentMonthStr) {
        // Month has changed! Archive the PREVIOUS month(s)
        // For simplicity, we archive the month stored in lastProcessedMonth
        await archiveMonth(family.lastProcessedMonth);
      }
    };
    checkMonthEnd();
  }, [family?.id, family?.lastProcessedMonth, profile?.role]);

  useEffect(() => {
    if (user?.uid) {
      // Listen to private loans
      const q = query(
        collection(db, 'users', user.uid, 'privateLoans'),
        orderBy('date', 'desc')
      );
      const unsubLoans = onSnapshot(q, (s) => {
        setPrivateLoans(s.docs.map(d => ({ id: d.id, ...d.data() } as PrivateLoan)));
      });
      return unsubLoans;
    }
  }, [user?.uid]);

  useEffect(() => {
    localStorage.setItem('lang', lang);
  }, [lang]);

  useEffect(() => {
    if (feedback) {
      const timer = setTimeout(() => setFeedback(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [feedback]);

  // --- Actions ---

  const handleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (err) {
      console.error("Login failed", err);
    }
  };

  const handleLogout = () => signOut(auth);

  const createFamily = async (name: string) => {
    if (!user) return;
    const familyRef = doc(collection(db, 'families'));
    const familyData = {
      name,
      adminUid: user.uid,
      budget: 0,
      savingsGoal: "",
      savingsGoalAmount: 0,
      currentSavings: 0,
      categories: [t.food, t.farming, t.education, t.medical, t.others]
    };
    await setDoc(familyRef, familyData);
    
    const profileData: UserProfile = {
      uid: user.uid,
      name: user.displayName || "User",
      familyId: familyRef.id,
      role: 'admin',
      email: user.email || ""
    };
    await setDoc(doc(db, 'users', user.uid), profileData);
    setProfile(profileData);
  };

  const joinFamily = async (familyId: string) => {
    if (!user) return;
    const familyDoc = await getDoc(doc(db, 'families', familyId));
    if (familyDoc.exists()) {
      const profileData: UserProfile = {
        uid: user.uid,
        name: user.displayName || "User",
        familyId,
        role: 'member',
        email: user.email || ""
      };
      await setDoc(doc(db, 'users', user.uid), profileData);
      setProfile(profileData);
      setFeedback({ type: 'success', msg: lang === 'mr' ? "कुटुंबात सामील झाले!" : "Joined family!" });
    } else {
      setFeedback({ type: 'error', msg: lang === 'mr' ? "चुकीचा आयडी" : "Invalid ID" });
    }
  };

  const addTransaction = async (data: Omit<Transaction, 'id' | 'uid' | 'userName'>) => {
    if (!profile?.familyId || !user) return;
    await addDoc(collection(db, 'families', profile.familyId, 'transactions'), {
      ...data,
      uid: user.uid,
      userName: profile.name
    });
  };

  const deleteTransaction = async (id: string) => {
    if (!profile?.familyId) return;
    await deleteDoc(doc(db, 'families', profile.familyId, 'transactions', id));
  };

  const addPrivateLoan = async (data: Omit<PrivateLoan, 'id'>) => {
    if (!user) return;
    await addDoc(collection(db, 'users', user.uid, 'privateLoans'), data);
  };

  const updateLoanStatus = async (id: string, status: 'pending' | 'returned') => {
    if (!user) return;
    await updateDoc(doc(db, 'users', user.uid, 'privateLoans', id), { status });
  };

  const deleteLoan = async (id: string) => {
    if (!user) return;
    await deleteDoc(doc(db, 'users', user.uid, 'privateLoans', id));
  };

  const updateFamilySettings = async (data: Partial<Family>) => {
    if (!profile?.familyId) return;
    await updateDoc(doc(db, 'families', profile.familyId), data);
  };

  const removeMember = async (uid: string) => {
    if (!profile?.familyId || profile.role !== 'admin') return;
    await updateDoc(doc(db, 'users', uid), { familyId: "" });
  };

  const archiveMonth = async (monthStr: string) => {
    if (!profile?.familyId || !family || isArchiving) return;
    setIsArchiving(true);
    setFeedback({ type: 'success', msg: t.archivingData });

    try {
      // 1. Get all transactions for that month
      const [year, month] = monthStr.split('-').map(Number);
      const monthTransactions = transactions.filter(tr => {
        const d = new Date(tr.date);
        return d.getFullYear() === year && (d.getMonth() + 1) === month;
      });

      if (monthTransactions.length === 0) {
        // Nothing to archive, just update the month
        const nextMonth = new Date(year, month, 1);
        const nextMonthStr = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}`;
        await updateFamilySettings({ lastProcessedMonth: nextMonthStr });
        setIsArchiving(false);
        return;
      }

      // 2. Calculate summary
      const totalIncome = monthTransactions.filter(t => t.type === 'income').reduce((acc, t) => acc + t.amount, 0);
      const totalExpense = monthTransactions.filter(t => t.type === 'expense').reduce((acc, t) => acc + t.amount, 0);
      const balance = totalIncome - totalExpense;

      const categoryBreakdown = monthTransactions.reduce((acc, tr) => {
        if (tr.type === 'expense') {
          acc[tr.category] = (acc[tr.category] || 0) + tr.amount;
        }
        return acc;
      }, {} as Record<string, number>);

      const memberContributions = monthTransactions.reduce((acc, tr) => {
        if (!acc[tr.userName]) acc[tr.userName] = { income: 0, expense: 0 };
        if (tr.type === 'income') acc[tr.userName].income += tr.amount;
        else acc[tr.userName].expense += tr.amount;
        return acc;
      }, {} as Record<string, { income: number, expense: number }>);

      // Loan summary (from transactions or private loans? Requirement says "Loan (Usne) summary")
      // Since private loans are per-user, we might need to aggregate them if they are family-wide,
      // but the app seems to keep them private. However, the requirement asks for it in the report.
      // I'll aggregate the current user's loans for now as a representative.
      const loanSummary = {
        lent: privateLoans.filter(l => l.type === 'lent').reduce((acc, l) => acc + l.amount, 0),
        borrowed: privateLoans.filter(l => l.type === 'borrowed').reduce((acc, l) => acc + l.amount, 0),
        returned: privateLoans.filter(l => l.status === 'returned').reduce((acc, l) => acc + l.amount, 0),
        pending: privateLoans.filter(l => l.status === 'pending').reduce((acc, l) => acc + l.amount, 0),
      };

      const reportData: Omit<MonthlyReport, 'id'> = {
        month: monthStr,
        totalIncome,
        totalExpense,
        balance,
        categoryBreakdown,
        memberContributions,
        loanSummary
      };

      // 3. Save report
      const reportRef = doc(collection(db, 'families', profile.familyId, 'archives'));
      await setDoc(reportRef, reportData);

      // 4. Move transactions to archive subcollection and delete from active
      for (const tr of monthTransactions) {
        const { id, ...trData } = tr;
        await setDoc(doc(db, 'families', profile.familyId, 'archives', reportRef.id, 'transactions', id), trData);
        await deleteDoc(doc(db, 'families', profile.familyId, 'transactions', id));
        
        // If recurring, carry forward to next month
        if (tr.isRecurring) {
          const nextDate = new Date(tr.date);
          nextDate.setMonth(nextDate.getMonth() + 1);
          await addTransaction({
            ...trData,
            date: nextDate.toISOString().split('T')[0]
          });
        }
      }

      // 5. Update family settings
      const nextMonth = new Date(year, month, 1);
      const nextMonthStr = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}`;
      
      await updateFamilySettings({
        lastProcessedMonth: nextMonthStr,
        carryForwardBalance: (family.carryForwardBalance || 0) + balance
      });

      // 6. Send Email
      if (profile.email) {
        fetch('/api/send-report', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: profile.email,
            report: reportData,
            lang
          })
        }).then(res => {
          if (res.ok) setFeedback({ type: 'success', msg: t.reportSent });
        }).catch(err => console.error("Email failed", err));
      }

      setFeedback({ type: 'success', msg: lang === 'mr' ? "महिना यशस्वीरित्या संग्रहित केला!" : "Month archived successfully!" });
    } catch (err) {
      console.error("Archiving failed", err);
      setFeedback({ type: 'error', msg: t.error });
    } finally {
      setIsArchiving(false);
    }
  };

  // --- Calculations ---

  const stats = useMemo(() => {
    const income = transactions.filter(t => t.type === 'income').reduce((acc, t) => acc + t.amount, 0);
    const expense = transactions.filter(t => t.type === 'expense').reduce((acc, t) => acc + t.amount, 0);
    const balance = income - expense;
    
    // Monthly stats
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const monthlyExpense = transactions
      .filter(t => {
        const d = new Date(t.date);
        return t.type === 'expense' && d.getMonth() === currentMonth && d.getFullYear() === currentYear;
      })
      .reduce((acc, t) => acc + t.amount, 0);

    return { income, expense, balance, monthlyExpense };
  }, [transactions]);

  const chartData = useMemo(() => {
    const categories = family?.categories || [t.food, t.farming, t.education, t.medical, t.others];
    return categories.map(cat => ({
      name: cat,
      value: transactions
        .filter(tr => tr.type === 'expense' && tr.category === cat)
        .reduce((acc, tr) => acc + tr.amount, 0)
    })).filter(d => d.value > 0);
  }, [transactions, t, family?.categories]);

  const budgetProgress = family?.budget ? (stats.monthlyExpense / family.budget) * 100 : 0;
  const savingsProgress = family?.savingsGoalAmount ? (family.currentSavings / family.savingsGoalAmount) * 100 : 0;

  // --- Render Helpers ---

  if (loading) return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950 flex items-center justify-center p-6 transition-colors">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <p className="text-stone-600 dark:text-stone-400 font-medium">{t.loading}</p>
      </div>
    </div>
  );

  if (!user) return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950 flex flex-col items-center justify-center p-6 text-center transition-colors">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full bg-white dark:bg-stone-900 p-8 rounded-3xl shadow-xl border border-stone-200 dark:border-stone-800 transition-colors"
      >
        <div className="w-20 h-20 bg-orange-100 dark:bg-orange-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
          <Wallet className="w-10 h-10 text-orange-600 dark:text-orange-400" />
        </div>
        <h1 className="text-3xl font-bold text-stone-900 dark:text-stone-50 mb-2">{t.appName}</h1>
        <p className="text-stone-600 dark:text-stone-400 mb-8">{lang === 'mr' ? "ग्रामीण कुटुंबांसाठी सोपे आर्थिक व्यवस्थापन" : "Simple financial management for rural families"}</p>
        
        <button 
          onClick={handleLogin}
          className="w-full py-4 px-6 bg-orange-600 hover:bg-orange-700 text-white rounded-2xl font-bold text-lg shadow-lg transition-all flex items-center justify-center gap-3"
        >
          <Globe className="w-6 h-6" />
          {t.login}
        </button>

        <div className="mt-8 flex justify-center gap-4">
          <button 
            onClick={() => setLang('mr')}
            className={cn("px-4 py-2 rounded-full text-sm font-bold transition-all", lang === 'mr' ? "bg-stone-900 dark:bg-stone-50 text-white dark:text-stone-900" : "bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400")}
          >
            मराठी
          </button>
          <button 
            onClick={() => setLang('en')}
            className={cn("px-4 py-2 rounded-full text-sm font-bold transition-all", lang === 'en' ? "bg-stone-900 dark:bg-stone-50 text-white dark:text-stone-900" : "bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400")}
          >
            English
          </button>
        </div>
      </motion.div>
    </div>
  );

  if (!profile?.familyId) return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950 p-6 flex flex-col items-center justify-center transition-colors">
      <div className="max-w-md w-full space-y-6">
        <div className="bg-white dark:bg-stone-900 p-8 rounded-3xl shadow-lg border border-stone-200 dark:border-stone-800 transition-colors">
          <h2 className="text-2xl font-bold text-stone-900 dark:text-stone-50 mb-6 text-center">{t.welcome}, {user.displayName}</h2>
          
          <div className="space-y-4">
            {!showCreateForm && !showJoinForm && (
              <>
                <button 
                  onClick={() => setShowCreateForm(true)}
                  className="w-full p-6 bg-orange-50 dark:bg-orange-950/30 border-2 border-orange-200 dark:border-orange-900/50 hover:border-orange-500 rounded-2xl text-left transition-all group"
                >
                  <h3 className="text-xl font-bold text-orange-900 dark:text-orange-400 mb-1">{t.createFamily}</h3>
                  <p className="text-orange-700 dark:text-orange-500 text-sm">{lang === 'mr' ? "तुमच्या कुटुंबासाठी नवीन खाते सुरू करा" : "Start a new account for your family"}</p>
                </button>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-stone-200 dark:border-stone-800"></span></div>
                  <div className="relative flex justify-center text-xs uppercase"><span className="bg-white dark:bg-stone-900 px-2 text-stone-400 dark:text-stone-500">OR</span></div>
                </div>

                <button 
                  onClick={() => setShowJoinForm(true)}
                  className="w-full p-6 bg-stone-50 dark:bg-stone-800 border-2 border-stone-200 dark:border-stone-700 hover:border-stone-900 dark:hover:border-stone-50 rounded-2xl text-left transition-all group"
                >
                  <h3 className="text-xl font-bold text-stone-900 dark:text-stone-50 mb-1">{t.joinFamily}</h3>
                  <p className="text-stone-600 dark:text-stone-400 text-sm">{lang === 'mr' ? "तुमच्या कुटुंबाच्या आयडीने सामील व्हा" : "Join using your family's ID"}</p>
                </button>
              </>
            )}

            {showCreateForm && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-stone-600 dark:text-stone-400">{t.familyName}</label>
                  <input 
                    type="text" 
                    value={familyNameInput}
                    onChange={(e) => setFamilyNameInput(e.target.value)}
                    className="w-full p-4 bg-stone-50 dark:bg-stone-800 border-2 border-stone-100 dark:border-stone-700 rounded-2xl focus:border-orange-500 outline-none font-bold dark:text-stone-50"
                    placeholder={lang === 'mr' ? "उदा. चव्हाण कुटुंब" : "e.g. Chavan Family"}
                  />
                </div>
                <div className="flex gap-3">
                  <button 
                    onClick={() => {
                      if (familyNameInput) createFamily(familyNameInput);
                    }}
                    className="flex-1 py-4 bg-orange-600 text-white rounded-2xl font-bold shadow-lg"
                  >
                    {t.save}
                  </button>
                  <button 
                    onClick={() => setShowCreateForm(false)}
                    className="px-6 py-4 bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400 rounded-2xl font-bold"
                  >
                    {t.cancel}
                  </button>
                </div>
              </motion.div>
            )}

            {showJoinForm && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-stone-600 dark:text-stone-400">{t.familyId}</label>
                  <input 
                    type="text" 
                    value={familyIdInput}
                    onChange={(e) => setFamilyIdInput(e.target.value)}
                    className="w-full p-4 bg-stone-50 dark:bg-stone-800 border-2 border-stone-100 dark:border-stone-700 rounded-2xl focus:border-stone-900 dark:focus:border-stone-50 outline-none font-bold dark:text-stone-50"
                    placeholder="ID..."
                  />
                </div>
                <div className="flex gap-3">
                  <button 
                    onClick={() => {
                      if (familyIdInput) joinFamily(familyIdInput);
                    }}
                    className="flex-1 py-4 bg-stone-900 dark:bg-stone-800 text-white rounded-2xl font-bold shadow-lg"
                  >
                    {t.joinFamily}
                  </button>
                  <button 
                    onClick={() => setShowJoinForm(false)}
                    className="px-6 py-4 bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400 rounded-2xl font-bold"
                  >
                    {t.cancel}
                  </button>
                </div>
              </motion.div>
            )}
          </div>
        </div>
        
        <button onClick={handleLogout} className="flex items-center gap-2 text-stone-500 hover:text-stone-900 dark:hover:text-stone-50 font-bold mx-auto transition-colors">
          <LogOut className="w-5 h-5" /> {t.logout}
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950 pb-24 transition-colors duration-300">
      {/* Feedback Message */}
      <AnimatePresence>
        {feedback && (
          <motion.div 
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className={cn(
              "fixed bottom-24 left-6 right-6 z-50 p-4 rounded-2xl shadow-2xl text-white font-bold text-center",
              feedback.type === 'success' ? "bg-green-600" : "bg-red-600"
            )}
          >
            {feedback.msg}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="bg-white dark:bg-stone-900 border-b border-stone-200 dark:border-stone-800 sticky top-0 z-10 px-6 py-4 flex items-center justify-between transition-colors">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-orange-600 rounded-xl flex items-center justify-center text-white">
            <Wallet className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-stone-900 dark:text-stone-50 leading-tight">{family?.name}</h1>
            <p className="text-xs text-stone-500 dark:text-stone-400 font-medium">{profile.name} ({t[profile.role]})</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setLang(lang === 'mr' ? 'en' : 'mr')}
            className="w-10 h-10 rounded-full bg-stone-100 dark:bg-stone-800 flex items-center justify-center text-stone-600 dark:text-stone-300"
          >
            <Globe className="w-5 h-5" />
          </button>
          <button 
            onClick={handleLogout}
            className="w-10 h-10 rounded-full bg-stone-100 dark:bg-stone-800 flex items-center justify-center text-stone-600 dark:text-stone-300"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-6 space-y-6">
        <AnimatePresence mode="wait">
          {view === 'dashboard' && (
            <motion.div 
              key="dashboard"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-6"
            >
              {/* Daily Reminder */}
              {transactions.filter(t => t.date === new Date().toISOString().split('T')[0]).length === 0 && (
                <div className="bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-900/50 p-4 rounded-2xl flex items-center gap-4 text-orange-800 dark:text-orange-400 transition-colors">
                  <PlusCircle className="w-6 h-6 shrink-0" />
                  <p className="font-bold text-sm">{t.dailyReminder}</p>
                </div>
              )}

              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white dark:bg-stone-900 p-6 rounded-3xl shadow-sm border border-stone-200 dark:border-stone-800 transition-colors">
                  <div className="flex justify-between items-start mb-1">
                    <p className="text-stone-500 dark:text-stone-400 text-sm font-bold uppercase tracking-wider">{t.totalIncome}</p>
                    <button 
                      onClick={() => setView('history')}
                      className="text-[10px] font-bold text-orange-600 hover:underline uppercase tracking-widest"
                    >
                      {t.history} →
                    </button>
                  </div>
                  <p className="text-3xl font-black text-green-600 dark:text-green-400">₹{stats.income.toLocaleString()}</p>
                </div>
                <div className="bg-white dark:bg-stone-900 p-6 rounded-3xl shadow-sm border border-stone-200 dark:border-stone-800 transition-colors">
                  <p className="text-stone-500 dark:text-stone-400 text-sm font-bold uppercase tracking-wider mb-1">{t.totalExpense}</p>
                  <p className="text-3xl font-black text-red-600 dark:text-red-400">₹{stats.expense.toLocaleString()}</p>
                </div>
                <div className="bg-orange-600 p-6 rounded-3xl shadow-lg text-white">
                  <p className="text-orange-200 text-sm font-bold uppercase tracking-wider mb-1">{t.balance}</p>
                  <p className="text-3xl font-black">₹{stats.balance.toLocaleString()}</p>
                  {family?.carryForwardBalance !== undefined && family.carryForwardBalance !== 0 && (
                    <p className="text-xs text-orange-200 mt-1 font-bold">
                      {t.carryForward}: ₹{family.carryForwardBalance.toLocaleString()}
                    </p>
                  )}
                </div>
              </div>

              {/* Budget Alert */}
              {family?.budget && (
                <div className={cn(
                  "p-4 rounded-2xl flex items-center gap-4 border transition-colors",
                  budgetProgress >= 100 ? "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-400" : 
                  budgetProgress >= 80 ? "bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-900/50 text-orange-700 dark:text-orange-400" : 
                  "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-900/50 text-green-700 dark:text-green-400"
                )}>
                  {budgetProgress >= 80 ? <AlertTriangle className="w-6 h-6 shrink-0" /> : <CheckCircle2 className="w-6 h-6 shrink-0" />}
                  <div className="flex-1">
                    <p className="font-bold text-sm">
                      {budgetProgress >= 100 ? t.budgetExceeded : budgetProgress >= 80 ? t.budgetAlert : t.goodJob}
                    </p>
                    <div className="w-full bg-black/10 h-2 rounded-full mt-2 overflow-hidden">
                      <div 
                        className={cn("h-full transition-all", budgetProgress >= 100 ? "bg-red-600" : budgetProgress >= 80 ? "bg-orange-600" : "bg-green-600")} 
                        style={{ width: `${Math.min(budgetProgress, 100)}%` }} 
                      />
                    </div>
                  </div>
                  <p className="font-black text-lg">{Math.round(budgetProgress)}%</p>
                </div>
              )}

              {/* Savings Goal */}
              {family?.savingsGoal && (
                <div className="bg-white dark:bg-stone-900 p-6 rounded-3xl shadow-sm border border-stone-200 dark:border-stone-800 transition-colors">
                  <div className="flex justify-between items-end mb-4">
                    <div>
                      <p className="text-stone-500 dark:text-stone-400 text-xs font-bold uppercase tracking-wider">{t.savingsGoal}</p>
                      <h3 className="text-xl font-bold text-stone-900 dark:text-stone-50">{family.savingsGoal}</h3>
                    </div>
                    <p className="text-stone-900 dark:text-stone-50 font-black text-lg">₹{family.currentSavings.toLocaleString()} / ₹{family.savingsGoalAmount.toLocaleString()}</p>
                  </div>
                  <div className="w-full bg-stone-100 dark:bg-stone-800 h-4 rounded-full overflow-hidden">
                    <div 
                      className="bg-orange-600 h-full transition-all" 
                      style={{ width: `${Math.min(savingsProgress, 100)}%` }} 
                    />
                  </div>
                  <p className="text-right text-xs font-bold text-stone-500 dark:text-stone-400 mt-2">{Math.round(savingsProgress)}% {t.progress}</p>
                </div>
              )}

              {/* Chart */}
              {chartData.length > 0 && (
                <div className="bg-white dark:bg-stone-900 p-6 rounded-3xl shadow-sm border border-stone-200 dark:border-stone-800 transition-colors">
                  <h3 className="text-lg font-bold text-stone-900 dark:text-stone-50 mb-6">{t.monthlySummary}</h3>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={darkMode ? "#292524" : "#f0f0f0"} />
                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fontWeight: 600, fill: darkMode ? "#a8a29e" : "#78716c" }} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fontWeight: 600, fill: darkMode ? "#a8a29e" : "#78716c" }} />
                        <Tooltip 
                          cursor={{ fill: darkMode ? '#1c1917' : '#f9fafb' }} 
                          contentStyle={{ 
                            borderRadius: '16px', 
                            border: 'none', 
                            boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                            backgroundColor: darkMode ? '#1c1917' : '#ffffff',
                            color: darkMode ? '#fafaf9' : '#1c1917'
                          }} 
                        />
                        <Bar dataKey="value" fill="#ea580c" radius={[8, 8, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* Admin Reports */}
              {profile.role === 'admin' && transactions.length > 0 && (
                <div className="bg-white dark:bg-stone-900 rounded-3xl shadow-sm border border-stone-200 dark:border-stone-800 overflow-hidden transition-colors">
                  <div className="p-6 border-b border-stone-100 dark:border-stone-800">
                    <h3 className="text-lg font-bold text-stone-900 dark:text-stone-50">{t.monthlySummary} (Admin)</h3>
                  </div>
                  <div className="p-6 space-y-4">
                    {Object.entries(
                      transactions.reduce((acc, tr) => {
                        if (tr.type === 'expense') {
                          acc[tr.category] = (acc[tr.category] || 0) + tr.amount;
                        }
                        return acc;
                      }, {} as Record<string, number>)
                    ).map(([cat, amt]) => (
                      <div key={cat} className="flex justify-between items-center">
                        <span className="text-stone-600 dark:text-stone-400 font-bold">{cat}</span>
                        <div className="flex-1 mx-4 h-2 bg-stone-100 dark:bg-stone-800 rounded-full overflow-hidden">
                          <div 
                            className="bg-orange-500 h-full" 
                            style={{ width: `${(amt / stats.expense) * 100}%` }} 
                          />
                        </div>
                        <span className="text-stone-900 dark:text-stone-50 font-black">₹{amt.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recent Transactions */}
              <div className="bg-white dark:bg-stone-900 rounded-3xl shadow-sm border border-stone-200 dark:border-stone-800 overflow-hidden transition-colors">
                <div className="p-6 border-b border-stone-100 dark:border-stone-800 flex justify-between items-center">
                  <h3 className="text-lg font-bold text-stone-900 dark:text-stone-50">{t.transactions}</h3>
                  <button onClick={() => setView('transactions')} className="text-orange-600 dark:text-orange-400 font-bold text-sm flex items-center gap-1">
                    {lang === 'mr' ? "सर्व पहा" : "See All"} <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
                <div className="divide-y divide-stone-100 dark:divide-stone-800">
                  {transactions.slice(0, 5).map(tr => (
                    <div key={tr.id} className="p-4 flex items-center justify-between hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors">
                      <div className="flex items-center gap-4">
                        <div className={cn(
                          "w-12 h-12 rounded-2xl flex items-center justify-center",
                          tr.type === 'income' ? "bg-green-100 dark:bg-green-950/30 text-green-600 dark:text-green-400" : "bg-red-100 dark:bg-red-950/30 text-red-600 dark:text-red-400"
                        )}>
                          {tr.type === 'income' ? <TrendingUp className="w-6 h-6" /> : <TrendingDown className="w-6 h-6" />}
                        </div>
                        <div>
                          <p className="font-bold text-stone-900 dark:text-stone-50">{tr.category}</p>
                          <p className="text-xs text-stone-500 dark:text-stone-400 font-medium">{tr.userName} • {new Date(tr.date).toLocaleDateString(lang === 'mr' ? 'mr-IN' : 'en-US')}</p>
                        </div>
                      </div>
                      <p className={cn("font-black text-lg", tr.type === 'income' ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400")}>
                        {tr.type === 'income' ? '+' : '-'}₹{tr.amount.toLocaleString()}
                      </p>
                    </div>
                  ))}
                  {transactions.length === 0 && (
                    <div className="p-12 text-center text-stone-400 font-medium">
                      {t.noTransactions}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {view === 'transactions' && (
            <motion.div 
              key="transactions"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-6"
            >
              <div className="bg-white dark:bg-stone-900 p-6 rounded-3xl shadow-lg border border-stone-200 dark:border-stone-800 transition-colors">
                <h2 className="text-2xl font-bold text-stone-900 dark:text-stone-50 mb-6">{t.addTransaction}</h2>
                <form onSubmit={(e) => {
                  e.preventDefault();
                  const form = e.target as HTMLFormElement;
                  const formData = new FormData(form);
                  addTransaction({
                    amount: Number(formData.get('amount')),
                    type: formData.get('type') as 'income' | 'expense',
                    category: formData.get('category') as string,
                    date: formData.get('date') as string,
                    notes: formData.get('notes') as string,
                    isRecurring: formData.get('isRecurring') === 'on'
                  });
                  form.reset();
                }} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <label className="flex-1">
                      <input type="radio" name="type" value="expense" defaultChecked className="sr-only peer" />
                      <div className="p-4 text-center rounded-2xl border-2 border-stone-100 dark:border-stone-800 peer-checked:border-red-500 peer-checked:bg-red-50 dark:peer-checked:bg-red-950/30 font-bold transition-all cursor-pointer dark:text-stone-300">
                        {t.expense}
                      </div>
                    </label>
                    <label className="flex-1">
                      <input type="radio" name="type" value="income" className="sr-only peer" />
                      <div className="p-4 text-center rounded-2xl border-2 border-stone-100 dark:border-stone-800 peer-checked:border-green-500 peer-checked:bg-green-50 dark:peer-checked:bg-green-950/30 font-bold transition-all cursor-pointer dark:text-stone-300">
                        {t.income}
                      </div>
                    </label>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-bold text-stone-600 dark:text-stone-400">{t.amount}</label>
                    <input 
                      required 
                      name="amount" 
                      type="number" 
                      placeholder="0.00"
                      className="w-full p-4 bg-stone-50 dark:bg-stone-800 border-2 border-stone-100 dark:border-stone-700 rounded-2xl focus:border-orange-500 focus:bg-white dark:focus:bg-stone-900 outline-none text-2xl font-black transition-all dark:text-stone-50" 
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-stone-600 dark:text-stone-400">{t.category}</label>
                      <select name="category" className="w-full p-4 bg-stone-50 dark:bg-stone-800 border-2 border-stone-100 dark:border-stone-700 rounded-2xl focus:border-orange-500 focus:bg-white dark:focus:bg-stone-900 outline-none font-bold dark:text-stone-50">
                        {(family?.categories || [t.food, t.farming, t.education, t.medical, t.others]).map(cat => (
                          <option key={cat} value={cat} className="dark:bg-stone-900">{cat}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-stone-600 dark:text-stone-400">{t.date}</label>
                      <input 
                        required 
                        name="date" 
                        type="date" 
                        defaultValue={new Date().toISOString().split('T')[0]}
                        className="w-full p-4 bg-stone-50 dark:bg-stone-800 border-2 border-stone-100 dark:border-stone-700 rounded-2xl focus:border-orange-500 focus:bg-white dark:focus:bg-stone-900 outline-none font-bold dark:text-stone-50" 
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-bold text-stone-600 dark:text-stone-400">{t.notes}</label>
                    <textarea name="notes" className="w-full p-4 bg-stone-50 dark:bg-stone-800 border-2 border-stone-100 dark:border-stone-700 rounded-2xl focus:border-orange-500 focus:bg-white dark:focus:bg-stone-900 outline-none font-medium h-24 dark:text-stone-50" />
                  </div>

                  <label className="flex items-center gap-3 p-4 bg-stone-50 dark:bg-stone-800 rounded-2xl cursor-pointer">
                    <input type="checkbox" name="isRecurring" className="w-6 h-6 rounded-lg border-2 border-stone-300 dark:border-stone-600 text-orange-600 focus:ring-orange-500" />
                    <span className="font-bold text-stone-700 dark:text-stone-300">{t.recurring}</span>
                  </label>

                  <button type="submit" className="w-full py-4 bg-orange-600 hover:bg-orange-700 text-white rounded-2xl font-bold text-lg shadow-lg transition-all">
                    {t.save}
                  </button>
                </form>
              </div>

              <div className="bg-white dark:bg-stone-900 rounded-3xl shadow-sm border border-stone-200 dark:border-stone-800 overflow-hidden transition-colors">
                <div className="p-6 border-b border-stone-100 dark:border-stone-800">
                  <h3 className="text-lg font-bold text-stone-900 dark:text-stone-50">{t.transactions}</h3>
                </div>
                <div className="divide-y divide-stone-100 dark:divide-stone-800">
                  {transactions.map(tr => (
                    <div key={tr.id} className="p-6 flex items-center justify-between hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors">
                      <div className="flex items-center gap-4">
                        <div className={cn(
                          "w-12 h-12 rounded-2xl flex items-center justify-center",
                          tr.type === 'income' ? "bg-green-100 dark:bg-green-950/30 text-green-600 dark:text-green-400" : "bg-red-100 dark:bg-red-950/30 text-red-600 dark:text-red-400"
                        )}>
                          {tr.type === 'income' ? <TrendingUp className="w-6 h-6" /> : <TrendingDown className="w-6 h-6" />}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-bold text-stone-900 dark:text-stone-50">{tr.category}</p>
                            {tr.isRecurring && <Calendar className="w-3 h-3 text-orange-500" />}
                          </div>
                          <p className="text-xs text-stone-500 dark:text-stone-400 font-medium">{tr.userName} • {new Date(tr.date).toLocaleDateString(lang === 'mr' ? 'mr-IN' : 'en-US')}</p>
                          {tr.notes && <p className="text-sm text-stone-400 dark:text-stone-500 mt-1 italic">"{tr.notes}"</p>}
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <p className={cn("font-black text-xl", tr.type === 'income' ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400")}>
                          {tr.type === 'income' ? '+' : '-'}₹{tr.amount.toLocaleString()}
                        </p>
                        {(tr.uid === user.uid || profile.role === 'admin') && (
                          <button onClick={() => deleteTransaction(tr.id)} className="p-2 text-stone-300 hover:text-red-600 transition-colors">
                            <Trash2 className="w-5 h-5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {view === 'history' && (
            <motion.div 
              key="history"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-6"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <button 
                    onClick={() => setView('dashboard')}
                    className="p-2 bg-stone-100 dark:bg-stone-800 rounded-xl text-stone-600 dark:text-stone-400 hover:bg-stone-200 dark:hover:bg-stone-700 transition-colors"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <h2 className="text-2xl font-bold text-stone-900 dark:text-stone-50">{t.previousReports}</h2>
                </div>
              </div>

              {archives.length === 0 ? (
                <div className="bg-white dark:bg-stone-900 p-12 rounded-3xl border border-stone-200 dark:border-stone-800 text-center transition-colors">
                  <Calendar className="w-12 h-12 text-stone-300 dark:text-stone-700 mx-auto mb-4" />
                  <p className="text-stone-500 dark:text-stone-400 font-medium">{t.noReports}</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4">
                  {archives.map(report => (
                    <div 
                      key={report.id} 
                      className="bg-white dark:bg-stone-900 p-6 rounded-3xl shadow-sm border border-stone-200 dark:border-stone-800 transition-colors"
                    >
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <h3 className="text-xl font-bold text-stone-900 dark:text-stone-50">{report.month}</h3>
                          <p className="text-sm text-stone-500 dark:text-stone-400 font-medium">{t.monthlySummary}</p>
                        </div>
                        <button 
                          onClick={() => setSelectedReport(selectedReport?.id === report.id ? null : report)}
                          className="px-4 py-2 bg-stone-100 dark:bg-stone-800 text-stone-900 dark:text-stone-50 rounded-xl font-bold text-sm transition-all"
                        >
                          {selectedReport?.id === report.id ? t.cancel : t.viewReport}
                        </button>
                      </div>

                      <div className="grid grid-cols-3 gap-4">
                        <div className="text-center">
                          <p className="text-[10px] font-bold text-stone-400 uppercase">{t.income}</p>
                          <p className="font-black text-green-600 dark:text-green-400">₹{report.totalIncome.toLocaleString()}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-[10px] font-bold text-stone-400 uppercase">{t.expense}</p>
                          <p className="font-black text-red-600 dark:text-red-400">₹{report.totalExpense.toLocaleString()}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-[10px] font-bold text-stone-400 uppercase">{t.balance}</p>
                          <p className="font-black text-orange-600 dark:text-orange-400">₹{report.balance.toLocaleString()}</p>
                        </div>
                      </div>

                      <AnimatePresence>
                        {selectedReport?.id === report.id && (
                          <motion.div 
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden mt-6 pt-6 border-t border-stone-100 dark:border-stone-800 space-y-6"
                          >
                            {/* Category Breakdown */}
                            <div>
                              <h4 className="text-sm font-bold text-stone-900 dark:text-stone-50 mb-3">{t.category}</h4>
                              <div className="space-y-2">
                                {Object.entries(report.categoryBreakdown).map(([cat, amt]) => (
                                  <div key={cat} className="flex justify-between items-center text-sm">
                                    <span className="text-stone-600 dark:text-stone-400 font-medium">{cat}</span>
                                    <span className="text-stone-900 dark:text-stone-50 font-bold">₹{amt.toLocaleString()}</span>
                                  </div>
                                ))}
                              </div>
                            </div>

                            {/* Member Contributions */}
                            <div>
                              <h4 className="text-sm font-bold text-stone-900 dark:text-stone-50 mb-3">{t.memberContribution}</h4>
                              <div className="space-y-3">
                                {Object.entries(report.memberContributions).map(([name, data]) => (
                                  <div key={name} className="bg-stone-50 dark:bg-stone-800/50 p-3 rounded-xl">
                                    <p className="text-sm font-bold text-stone-900 dark:text-stone-50 mb-1">{name}</p>
                                    <div className="flex justify-between text-xs">
                                      <span className="text-green-600 dark:text-green-400 font-bold">{t.income}: ₹{data.income.toLocaleString()}</span>
                                      <span className="text-red-600 dark:text-red-400 font-bold">{t.expense}: ₹{data.expense.toLocaleString()}</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>

                            {/* Loan Summary */}
                            <div>
                              <h4 className="text-sm font-bold text-stone-900 dark:text-stone-50 mb-3">{t.loanSummary}</h4>
                              <div className="grid grid-cols-2 gap-3">
                                <div className="p-3 bg-stone-50 dark:bg-stone-800/50 rounded-xl">
                                  <p className="text-[10px] font-bold text-stone-400 uppercase">{t.lent}</p>
                                  <p className="text-sm font-bold text-stone-900 dark:text-stone-50">₹{report.loanSummary.lent.toLocaleString()}</p>
                                </div>
                                <div className="p-3 bg-stone-50 dark:bg-stone-800/50 rounded-xl">
                                  <p className="text-[10px] font-bold text-stone-400 uppercase">{t.borrowed}</p>
                                  <p className="text-sm font-bold text-stone-900 dark:text-stone-50">₹{report.loanSummary.borrowed.toLocaleString()}</p>
                                </div>
                                <div className="p-3 bg-stone-50 dark:bg-stone-800/50 rounded-xl">
                                  <p className="text-[10px] font-bold text-stone-400 uppercase">{t.returned}</p>
                                  <p className="text-sm font-bold text-stone-900 dark:text-stone-50">₹{report.loanSummary.returned.toLocaleString()}</p>
                                </div>
                                <div className="p-3 bg-stone-50 dark:bg-stone-800/50 rounded-xl">
                                  <p className="text-[10px] font-bold text-stone-400 uppercase">{t.pending}</p>
                                  <p className="text-sm font-bold text-orange-600 dark:text-orange-400">₹{report.loanSummary.pending.toLocaleString()}</p>
                                </div>
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {view === 'private' && (
            <motion.div 
              key="private"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-6"
            >
              <div className="bg-stone-900 p-8 rounded-3xl shadow-xl text-white relative overflow-hidden">
                <div className="absolute top-0 right-0 p-8 opacity-10">
                  <HandCoins className="w-32 h-32" />
                </div>
                <h2 className="text-2xl font-bold mb-2">{t.privateLoans}</h2>
                <p className="text-stone-400 text-sm mb-8">{t.privateSection}</p>
                
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-white/10 p-4 rounded-2xl">
                    <p className="text-stone-400 text-xs font-bold uppercase mb-1">{t.lent}</p>
                    <p className="text-xl font-black text-green-400">₹{privateLoans.filter(l => l.type === 'lent' && l.status === 'pending').reduce((acc, l) => acc + l.amount, 0).toLocaleString()}</p>
                  </div>
                  <div className="bg-white/10 p-4 rounded-2xl">
                    <p className="text-stone-400 text-xs font-bold uppercase mb-1">{t.borrowed}</p>
                    <p className="text-xl font-black text-red-400">₹{privateLoans.filter(l => l.type === 'borrowed' && l.status === 'pending').reduce((acc, l) => acc + l.amount, 0).toLocaleString()}</p>
                  </div>
                  <div className="bg-white/10 p-4 rounded-2xl">
                    <p className="text-stone-400 text-xs font-bold uppercase mb-1">{t.returned}</p>
                    <p className="text-xl font-black text-blue-400">₹{privateLoans.filter(l => l.status === 'returned').reduce((acc, l) => acc + l.amount, 0).toLocaleString()}</p>
                  </div>
                </div>
              </div>

              <div className="bg-white dark:bg-stone-900 p-6 rounded-3xl shadow-lg border border-stone-200 dark:border-stone-800 transition-colors">
                <h3 className="text-xl font-bold text-stone-900 dark:text-stone-50 mb-6">{t.addLoan}</h3>
                <form onSubmit={(e) => {
                  e.preventDefault();
                  const form = e.target as HTMLFormElement;
                  const formData = new FormData(form);
                  addPrivateLoan({
                    personName: formData.get('personName') as string,
                    amount: Number(formData.get('amount')),
                    type: formData.get('type') as 'lent' | 'borrowed',
                    status: 'pending',
                    date: formData.get('date') as string,
                    notes: formData.get('notes') as string
                  });
                  form.reset();
                }} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <label className="flex-1">
                      <input type="radio" name="type" value="lent" defaultChecked className="sr-only peer" />
                      <div className="p-4 text-center rounded-2xl border-2 border-stone-100 dark:border-stone-800 peer-checked:border-green-500 peer-checked:bg-green-50 dark:peer-checked:bg-green-950/30 font-bold transition-all cursor-pointer dark:text-stone-300">
                        {t.lent}
                      </div>
                    </label>
                    <label className="flex-1">
                      <input type="radio" name="type" value="borrowed" className="sr-only peer" />
                      <div className="p-4 text-center rounded-2xl border-2 border-stone-100 dark:border-stone-800 peer-checked:border-red-500 peer-checked:bg-red-50 dark:peer-checked:bg-red-950/30 font-bold transition-all cursor-pointer dark:text-stone-300">
                        {t.borrowed}
                      </div>
                    </label>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-stone-600 dark:text-stone-400">{t.personName}</label>
                      <input required name="personName" type="text" className="w-full p-4 bg-stone-50 dark:bg-stone-800 border-2 border-stone-100 dark:border-stone-700 rounded-2xl focus:border-stone-900 dark:focus:border-stone-50 focus:bg-white dark:focus:bg-stone-900 outline-none font-bold dark:text-stone-50" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-stone-600 dark:text-stone-400">{t.amount}</label>
                      <input required name="amount" type="number" className="w-full p-4 bg-stone-50 dark:bg-stone-800 border-2 border-stone-100 dark:border-stone-700 rounded-2xl focus:border-stone-900 dark:focus:border-stone-50 focus:bg-white dark:focus:bg-stone-900 outline-none font-black text-xl dark:text-stone-50" />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-stone-600 dark:text-stone-400">{t.date}</label>
                      <input required name="date" type="date" defaultValue={new Date().toISOString().split('T')[0]} className="w-full p-4 bg-stone-50 dark:bg-stone-800 border-2 border-stone-100 dark:border-stone-700 rounded-2xl focus:border-stone-900 dark:focus:border-stone-50 focus:bg-white dark:focus:bg-stone-900 outline-none font-bold dark:text-stone-50" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-stone-600 dark:text-stone-400">{t.notes}</label>
                      <input name="notes" type="text" className="w-full p-4 bg-stone-50 dark:bg-stone-800 border-2 border-stone-100 dark:border-stone-700 rounded-2xl focus:border-stone-900 dark:focus:border-stone-50 focus:bg-white dark:focus:bg-stone-900 outline-none font-medium dark:text-stone-50" />
                    </div>
                  </div>

                  <button type="submit" className="w-full py-4 bg-stone-900 dark:bg-stone-800 hover:bg-black dark:hover:bg-stone-700 text-white rounded-2xl font-bold text-lg shadow-lg transition-all">
                    {t.save}
                  </button>
                </form>
              </div>

              <div className="space-y-4">
                {privateLoans.map(loan => (
                  <div key={loan.id} className={cn(
                    "bg-white dark:bg-stone-900 p-6 rounded-3xl shadow-sm border border-stone-200 dark:border-stone-800 flex items-center justify-between transition-all",
                    loan.status === 'returned' && "opacity-60"
                  )}>
                    <div className="flex items-center gap-4">
                      <div className={cn(
                        "w-12 h-12 rounded-2xl flex items-center justify-center",
                        loan.type === 'lent' ? "bg-green-100 dark:bg-green-950/30 text-green-600 dark:text-green-400" : "bg-red-100 dark:bg-red-950/30 text-red-600 dark:text-red-400"
                      )}>
                        <HandCoins className="w-6 h-6" />
                      </div>
                      <div>
                        <p className="font-bold text-stone-900 dark:text-stone-50 text-lg">{loan.personName}</p>
                        <p className="text-xs text-stone-500 dark:text-stone-400 font-bold uppercase tracking-wider">
                          {loan.type === 'lent' ? t.lent : t.borrowed} • {new Date(loan.date).toLocaleDateString(lang === 'mr' ? 'mr-IN' : 'en-US')}
                        </p>
                        {loan.notes && <p className="text-sm text-stone-400 dark:text-stone-500 mt-1 italic">"{loan.notes}"</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className={cn("font-black text-xl", loan.type === 'lent' ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400")}>
                          ₹{loan.amount.toLocaleString()}
                        </p>
                        <p className={cn("text-xs font-bold uppercase", loan.status === 'pending' ? "text-orange-600 dark:text-orange-400" : "text-blue-600 dark:text-blue-400")}>
                          {t[loan.status]}
                        </p>
                      </div>
                      <div className="flex flex-col gap-2">
                        {loan.status === 'pending' ? (
                          <button 
                            onClick={() => updateLoanStatus(loan.id, 'returned')}
                            className="p-2 bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 rounded-xl hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
                          >
                            <CheckCircle2 className="w-5 h-5" />
                          </button>
                        ) : (
                          <button 
                            onClick={() => updateLoanStatus(loan.id, 'pending')}
                            className="p-2 bg-stone-50 dark:bg-stone-800 text-stone-600 dark:text-stone-400 rounded-xl hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors"
                          >
                            <AlertTriangle className="w-5 h-5" />
                          </button>
                        )}
                        <button onClick={() => deleteLoan(loan.id)} className="p-2 text-stone-300 dark:text-stone-600 hover:text-red-600 transition-colors">
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {view === 'settings' && (
            <motion.div 
              key="settings"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-6"
            >
              {/* Family Info */}
              <div className="bg-white dark:bg-stone-900 p-8 rounded-3xl shadow-sm border border-stone-200 dark:border-stone-800 transition-colors">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-2xl font-bold text-stone-900 dark:text-stone-50">{t.settings}</h2>
                  <button 
                    onClick={() => setDarkMode(!darkMode)}
                    className="p-3 bg-stone-100 dark:bg-stone-800 rounded-2xl flex items-center gap-2 font-bold text-stone-600 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-700 transition-all"
                  >
                    {darkMode ? <Sun className="w-5 h-5 text-orange-500" /> : <Moon className="w-5 h-5 text-stone-600" />}
                    <span>{t.darkMode}</span>
                  </button>
                </div>
                
                <div className="space-y-6">
                  <div className="p-6 bg-stone-50 dark:bg-stone-800 rounded-2xl border border-stone-100 dark:border-stone-700 transition-colors">
                    <p className="text-stone-500 dark:text-stone-400 text-xs font-bold uppercase tracking-wider mb-2">{t.familyId}</p>
                    <div className="flex items-center gap-3">
                      <code className="flex-1 bg-white dark:bg-stone-900 p-3 rounded-xl border border-stone-200 dark:border-stone-800 font-mono text-sm break-all dark:text-stone-300">{profile.familyId}</code>
                      <button 
                        onClick={() => {
                          navigator.clipboard.writeText(profile.familyId);
                          setFeedback({ type: 'success', msg: t.copyId });
                        }}
                        className="p-3 bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors dark:text-stone-300"
                      >
                        <Copy className="w-5 h-5" />
                      </button>
                    </div>
                    <p className="text-stone-400 dark:text-stone-500 text-xs mt-2">{lang === 'mr' ? "हा आयडी इतर सदस्यांना सामील होण्यासाठी द्या" : "Share this ID with other members to join"}</p>
                  </div>

                  {profile.role === 'admin' && (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="text-sm font-bold text-stone-600 dark:text-stone-400">{t.budget}</label>
                        <div className="flex gap-2">
                          <input 
                            type="number" 
                            defaultValue={family?.budget} 
                            onBlur={(e) => updateFamilySettings({ budget: Number(e.target.value) })}
                            className="flex-1 p-4 bg-stone-50 dark:bg-stone-800 border-2 border-stone-100 dark:border-stone-700 rounded-2xl focus:border-orange-500 outline-none font-black text-xl dark:text-stone-50" 
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-sm font-bold text-stone-600 dark:text-stone-400">{t.savingsGoal}</label>
                          <input 
                            type="text" 
                            defaultValue={family?.savingsGoal} 
                            onBlur={(e) => updateFamilySettings({ savingsGoal: e.target.value })}
                            className="w-full p-4 bg-stone-50 dark:bg-stone-800 border-2 border-stone-100 dark:border-stone-700 rounded-2xl focus:border-orange-500 outline-none font-bold dark:text-stone-50" 
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-bold text-stone-600 dark:text-stone-400">{t.amount}</label>
                          <input 
                            type="number" 
                            defaultValue={family?.savingsGoalAmount} 
                            onBlur={(e) => updateFamilySettings({ savingsGoalAmount: Number(e.target.value) })}
                            className="w-full p-4 bg-stone-50 dark:bg-stone-800 border-2 border-stone-100 dark:border-stone-700 rounded-2xl focus:border-orange-500 outline-none font-black text-xl dark:text-stone-50" 
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-sm font-bold text-stone-600 dark:text-stone-400">{lang === 'mr' ? "सध्याची बचत" : "Current Savings"}</label>
                        <input 
                          type="number" 
                          defaultValue={family?.currentSavings} 
                          onBlur={(e) => updateFamilySettings({ currentSavings: Number(e.target.value) })}
                          className="w-full p-4 bg-stone-50 dark:bg-stone-800 border-2 border-stone-100 dark:border-stone-700 rounded-2xl focus:border-orange-500 outline-none font-black text-xl dark:text-stone-50" 
                        />
                      </div>

                      {/* Category Management */}
                      <div className="space-y-4 pt-4 border-t border-stone-100 dark:border-stone-800">
                        <label className="text-sm font-bold text-stone-600 dark:text-stone-400">{t.manageCategories}</label>
                        <div className="flex flex-wrap gap-2">
                          {(family?.categories || []).map((cat, idx) => (
                            <div key={idx} className="flex items-center gap-2 bg-orange-100 text-orange-800 px-3 py-2 rounded-xl font-bold text-sm">
                              {cat}
                              <button 
                                onClick={() => {
                                  const newCats = family?.categories?.filter((_, i) => i !== idx);
                                  updateFamilySettings({ categories: newCats });
                                }}
                                className="hover:text-red-600"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          ))}
                        </div>
                        <div className="flex gap-2">
                          <input 
                            type="text" 
                            id="newCategoryInput"
                            placeholder={t.addCategory}
                            className="flex-1 p-3 bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl outline-none focus:border-orange-500 font-bold text-sm dark:text-stone-50"
                          />
                          <button 
                            onClick={() => {
                              const input = document.getElementById('newCategoryInput') as HTMLInputElement;
                              if (input.value) {
                                const newCats = [...(family?.categories || []), input.value];
                                updateFamilySettings({ categories: newCats });
                                input.value = '';
                              }
                            }}
                            className="p-3 bg-orange-600 text-white rounded-xl hover:bg-orange-700 transition-colors"
                          >
                            <Plus className="w-5 h-5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Members List */}
              <div className="bg-white dark:bg-stone-900 rounded-3xl shadow-sm border border-stone-200 dark:border-stone-800 overflow-hidden transition-colors">
                <div className="p-6 border-b border-stone-100 dark:border-stone-800 flex items-center gap-2">
                  <Users className="w-6 h-6 text-stone-900 dark:text-stone-50" />
                  <h3 className="text-lg font-bold text-stone-900 dark:text-stone-50">{t.familyMembers}</h3>
                </div>
                <div className="divide-y divide-stone-100 dark:divide-stone-800">
                  {familyMembers.map(member => (
                    <div key={member.uid} className="p-6 flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-stone-100 dark:bg-stone-800 rounded-full flex items-center justify-center text-stone-600 dark:text-stone-400 font-black text-xl">
                          {member.name[0]}
                        </div>
                        <div>
                          <p className="font-bold text-stone-900 dark:text-stone-50">{member.name}</p>
                          <p className="text-xs text-stone-500 dark:text-stone-400 font-bold uppercase tracking-wider">{t[member.role]}</p>
                        </div>
                      </div>
                      {profile.role === 'admin' && member.uid !== user.uid && (
                        <div className="flex items-center gap-2">
                          {confirmDelete === member.uid ? (
                            <>
                              <button 
                                onClick={() => {
                                  removeMember(member.uid);
                                  setConfirmDelete(null);
                                }}
                                className="px-3 py-1 bg-red-600 text-white rounded-lg font-bold text-xs"
                              >
                                {t.save}
                              </button>
                              <button 
                                onClick={() => setConfirmDelete(null)}
                                className="px-3 py-1 bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400 rounded-lg font-bold text-xs"
                              >
                                {t.cancel}
                              </button>
                            </>
                          ) : (
                            <button 
                              onClick={() => setConfirmDelete(member.uid)}
                              className="p-3 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-xl transition-colors font-bold text-sm"
                            >
                              {t.remove}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white dark:bg-stone-900 border-t border-stone-200 dark:border-stone-800 px-6 py-3 flex justify-between items-center z-20 shadow-2xl transition-colors">
        <NavButton active={view === 'dashboard'} onClick={() => setView('dashboard')} icon={<LayoutDashboard />} label={t.dashboard} />
        <NavButton active={view === 'transactions'} onClick={() => setView('transactions')} icon={<PlusCircle />} label={t.transactions} />
        <NavButton active={view === 'private'} onClick={() => setView('private')} icon={<HandCoins />} label={t.privateLoans} />
        <NavButton active={view === 'history'} onClick={() => setView('history')} icon={<Calendar />} label={t.history} />
        <NavButton active={view === 'settings'} onClick={() => setView('settings')} icon={<Settings />} label={t.settings} />
      </nav>
    </div>
  );
}

function NavButton({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-1 transition-all",
        active ? "text-orange-600 scale-110" : "text-stone-400 dark:text-stone-500 hover:text-stone-600 dark:hover:text-stone-300"
      )}
    >
      <div className={cn("p-2 rounded-2xl transition-all", active ? "bg-orange-50 dark:bg-orange-950/30" : "bg-transparent")}>
        {React.isValidElement(icon) ? React.cloneElement(icon as React.ReactElement<{ className?: string }>, { className: "w-6 h-6" }) : icon}
      </div>
      <span className="text-[10px] font-black uppercase tracking-wider">{label}</span>
    </button>
  );
}
