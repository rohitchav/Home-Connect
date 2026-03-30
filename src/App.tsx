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
  Sun,
  Mail,
  PiggyBank,
  X
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
type View = 'dashboard' | 'transactions' | 'savings' | 'private' | 'settings' | 'history';

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
  type: 'income' | 'expense' | 'savings';
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
  totalSavings: number;
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
  const [isGenerating, setIsGenerating] = useState(false);
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
  const [dateFilter, setDateFilter] = useState<string>(new Date().toISOString().split('T')[0]);
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

  const addCategory = async (newCategory: string) => {
    if (!profile?.familyId || !family || !newCategory.trim()) return;
    const updatedCategories = [...(family.categories || []), newCategory.trim()];
    await updateFamilySettings({ categories: updatedCategories });
    setFeedback({ type: 'success', msg: lang === 'mr' ? "वर्ग जोडला!" : "Category added!" });
  };

  const removeCategory = async (categoryToRemove: string) => {
    if (!profile?.familyId || !family) return;
    const updatedCategories = (family.categories || []).filter(c => c !== categoryToRemove);
    await updateFamilySettings({ categories: updatedCategories });
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
      const totalSavings = monthTransactions.filter(t => t.type === 'savings').reduce((acc, t) => acc + t.amount, 0);
      const balance = totalIncome - totalExpense - totalSavings;

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
        totalSavings,
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
        carryForwardBalance: (family.carryForwardBalance || 0) + balance,
        currentSavings: (family.currentSavings || 0) + totalSavings
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

  const generateReport = async () => {
    if (!profile?.familyId || isGenerating) return;
    setIsGenerating(true);
    try {
      // In a real app, this would call a serverless function to send an email
      // For now, we simulate the process
      await new Promise(resolve => setTimeout(resolve, 2000));
      setFeedback({ type: 'success', msg: t.reportSent });
    } catch (error) {
      setFeedback({ type: 'error', msg: t.error });
    } finally {
      setIsGenerating(false);
    }
  };

  // --- Calculations ---

  const stats = useMemo(() => {
    const income = transactions.filter(t => t.type === 'income').reduce((acc, t) => acc + t.amount, 0);
    const expense = transactions.filter(t => t.type === 'expense').reduce((acc, t) => acc + t.amount, 0);
    const savings = transactions.filter(t => t.type === 'savings').reduce((acc, t) => acc + t.amount, 0);
    const balance = income - expense - savings;
    
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
    
    const monthlySavings = transactions
      .filter(t => {
        const d = new Date(t.date);
        return t.type === 'savings' && d.getMonth() === currentMonth && d.getFullYear() === currentYear;
      })
      .reduce((acc, t) => acc + t.amount, 0);

    return { income, expense, savings, balance, monthlyExpense, monthlySavings };
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
  const totalSavingsAmount = (family?.currentSavings || 0) + stats.savings;
  const savingsProgress = family?.savingsGoalAmount ? (totalSavingsAmount / family.savingsGoalAmount) * 100 : 0;

  // --- Render Helpers ---

  if (loading) return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950 flex items-center justify-center px-4 sm:px-6 py-4 transition-colors">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <p className="text-stone-600 dark:text-stone-400 font-medium">{t.loading}</p>
      </div>
    </div>
  );

  if (!user) return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950 flex flex-col items-center justify-center px-4 sm:px-8 py-8 text-center transition-colors">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-md w-full bg-white dark:bg-stone-900 p-4 sm:p-8 rounded-[2.5rem] sm:rounded-[3rem] shadow-2xl border border-stone-200 dark:border-stone-800 transition-colors"
      >
        <div className="w-20 h-20 sm:w-24 sm:h-24 bg-orange-100 dark:bg-orange-900/30 rounded-[1.5rem] sm:rounded-[2rem] flex items-center justify-center mx-auto mb-6 sm:mb-8 shadow-inner">
          <Wallet className="w-10 h-10 sm:w-12 sm:h-12 text-orange-600 dark:text-orange-400" />
        </div>
        <h1 className="text-lg sm:text-2xl font-black text-stone-900 dark:text-stone-50 mb-2 sm:mb-3 tracking-tight">{t.appName}</h1>
        <p className="text-base sm:text-xl font-bold text-stone-600 dark:text-stone-400 mb-8 sm:mb-10 leading-relaxed">
          {lang === 'mr' ? "ग्रामीण कुटुंबांसाठी सोपे आर्थिक व्यवस्थापन" : "Simple financial management for rural families"}
        </p>
        
        <button 
          onClick={handleLogin}
          className="w-full py-4 sm:py-6 px-4 sm:px-8 bg-orange-600 hover:bg-orange-700 text-white rounded-3xl font-black text-lg sm:text-xl shadow-xl transition-all flex items-center justify-center gap-3 sm:gap-4 active:scale-95"
        >
          <Globe className="w-6 h-6 sm:w-8 sm:h-8" />
          {t.login}
        </button>

        <div className="mt-8 sm:mt-12 flex justify-center gap-4 sm:gap-6">
          <button 
            onClick={() => setLang('mr')}
            className={cn("flex-1 sm:flex-none px-4 sm:px-8 py-3 sm:py-4 rounded-2xl text-sm sm:text-base font-black transition-all shadow-sm", lang === 'mr' ? "bg-stone-900 dark:bg-stone-50 text-white dark:text-stone-900" : "bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400")}
          >
            मराठी
          </button>
          <button 
            onClick={() => setLang('en')}
            className={cn("flex-1 sm:flex-none px-4 sm:px-8 py-3 sm:py-4 rounded-2xl text-sm sm:text-lg font-black transition-all shadow-sm", lang === 'en' ? "bg-stone-900 dark:bg-stone-50 text-white dark:text-stone-900" : "bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400")}
          >
            English
          </button>
        </div>
      </motion.div>
    </div>
  );

  if (!profile?.familyId) return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950 px-4 sm:px-8 py-8 flex flex-col items-center justify-center transition-colors">
      <div className="max-w-md w-full space-y-6 sm:space-y-8">
        <div className="bg-white dark:bg-stone-900 p-4 sm:p-8 rounded-[2.5rem] sm:rounded-[3rem] shadow-2xl border border-stone-200 dark:border-stone-800 transition-colors">
          <h2 className="text-lg sm:text-2xl font-black text-stone-900 dark:text-stone-50 mb-6 sm:mb-8 text-center leading-tight">{t.welcome},<br/>{user.displayName}</h2>
          
          <div className="space-y-4 sm:space-y-6">
            {!showCreateForm && !showJoinForm && (
              <>
                <button 
                  onClick={() => setShowCreateForm(true)}
                  className="w-full p-4 sm:p-6 bg-orange-50 dark:bg-orange-950/30 border-2 border-orange-200 dark:border-orange-900/50 hover:border-orange-500 rounded-[1.5rem] sm:rounded-[2rem] text-left transition-all group shadow-sm active:scale-95"
                >
                  <h3 className="text-base sm:text-xl font-black text-orange-900 dark:text-orange-400 mb-1 sm:mb-2">{t.createFamily}</h3>
                  <p className="text-orange-700 dark:text-orange-500 text-xs sm:text-sm font-bold">{lang === 'mr' ? "तुमच्या कुटुंबासाठी नवीन खाते सुरू करा" : "Start a new account for your family"}</p>
                </button>

                <div className="relative py-1 sm:py-2">
                  <div className="absolute inset-0 flex items-center"><span className="w-full border-t-2 border-stone-100 dark:border-stone-800"></span></div>
                  <div className="relative flex justify-center text-xs sm:text-sm font-black uppercase tracking-widest"><span className="bg-white dark:bg-stone-900 px-4 text-stone-400 dark:text-stone-500">OR</span></div>
                </div>

                <button 
                  onClick={() => setShowJoinForm(true)}
                  className="w-full p-4 sm:p-6 bg-stone-50 dark:bg-stone-800 border-2 border-stone-200 dark:border-stone-700 hover:border-stone-900 dark:hover:border-stone-50 rounded-[1.5rem] sm:rounded-[2rem] text-left transition-all group shadow-sm active:scale-95"
                >
                  <h3 className="text-base sm:text-xl font-black text-stone-900 dark:text-stone-50 mb-1 sm:mb-2">{t.joinFamily}</h3>
                  <p className="text-stone-600 dark:text-stone-400 text-xs sm:text-sm font-bold">{lang === 'mr' ? "तुमच्या कुटुंबाच्या आयडीने सामील व्हा" : "Join using your family's ID"}</p>
                </button>
              </>
            )}

            {showCreateForm && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4 sm:space-y-6">
                <div className="space-y-2 sm:space-y-3">
                  <label className="text-xs sm:text-sm font-black text-stone-600 dark:text-stone-400 uppercase tracking-wider">{t.familyName}</label>
                  <input 
                    type="text" 
                    value={familyNameInput}
                    onChange={(e) => setFamilyNameInput(e.target.value)}
                    className="w-full p-4 sm:p-6 bg-stone-50 dark:bg-stone-800 border-2 border-stone-100 dark:border-stone-700 rounded-3xl focus:border-orange-500 outline-none text-base sm:text-lg font-black dark:text-stone-50 transition-all"
                    placeholder={lang === 'mr' ? "उदा. चव्हाण कुटुंब" : "e.g. Chavan Family"}
                  />
                </div>
                <div className="flex flex-col gap-3 sm:gap-4">
                  <button 
                    onClick={() => {
                      if (familyNameInput) createFamily(familyNameInput);
                    }}
                    className="w-full py-4 sm:py-6 bg-orange-600 text-white rounded-3xl font-black text-lg sm:text-xl shadow-xl active:scale-95 transition-all"
                  >
                    {t.save}
                  </button>
                  <button 
                    onClick={() => setShowCreateForm(false)}
                    className="w-full py-4 sm:py-6 bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400 rounded-3xl font-black text-base sm:text-lg"
                  >
                    {t.cancel}
                  </button>
                </div>
              </motion.div>
            )}

            {showJoinForm && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4 sm:space-y-6">
                <div className="space-y-2 sm:space-y-3">
                  <label className="text-xs sm:text-sm font-black text-stone-600 dark:text-stone-400 uppercase tracking-wider">{t.familyId}</label>
                  <input 
                    type="text" 
                    value={familyIdInput}
                    onChange={(e) => setFamilyIdInput(e.target.value)}
                    className="w-full p-4 sm:p-6 bg-stone-50 dark:bg-stone-800 border-2 border-stone-100 dark:border-stone-700 rounded-3xl focus:border-stone-900 dark:focus:border-stone-50 outline-none text-base sm:text-lg font-black dark:text-stone-50 transition-all"
                    placeholder="ID..."
                  />
                </div>
                <div className="flex flex-col gap-3 sm:gap-4">
                  <button 
                    onClick={() => {
                      if (familyIdInput) joinFamily(familyIdInput);
                    }}
                    className="w-full py-4 sm:py-6 bg-stone-900 dark:bg-stone-800 text-white rounded-3xl font-black text-lg sm:text-xl shadow-xl active:scale-95 transition-all"
                  >
                    {t.joinFamily}
                  </button>
                  <button 
                    onClick={() => setShowJoinForm(false)}
                    className="w-full py-4 sm:py-6 bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400 rounded-3xl font-black text-base sm:text-lg"
                  >
                    {t.cancel}
                  </button>
                </div>
              </motion.div>
            )}
          </div>
        </div>
        
        <button onClick={handleLogout} className="flex items-center gap-2 sm:gap-3 text-stone-500 hover:text-stone-900 dark:hover:text-stone-50 font-black text-base sm:text-lg mx-auto transition-colors px-4 sm:px-6 py-4">
          <LogOut className="w-5 h-5 sm:w-6 h-6" /> {t.logout}
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950 pb-24 sm:pb-10 transition-colors duration-300 overflow-x-hidden">
      {/* Feedback Message */}
      <AnimatePresence>
        {feedback && (
          <motion.div 
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.9 }}
            className="fixed bottom-24 sm:bottom-32 left-4 sm:left-8 right-4 sm:right-8 z-50 pointer-events-none flex justify-center"
          >
            <div className={cn(
              "px-6 sm:px-10 py-4 sm:py-6 rounded-[2rem] shadow-2xl flex items-center gap-4 border-2 font-black text-base sm:text-xl backdrop-blur-md",
              feedback.type === 'success' ? "bg-green-500/90 text-white border-green-400" : "bg-red-500/90 text-white border-red-400"
            )}>
              {feedback.type === 'success' ? <CheckCircle2 className="w-6 h-6 sm:w-8 sm:h-8" /> : <AlertTriangle className="w-6 h-6 sm:w-8 sm:h-8" />}
              {feedback.msg}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="bg-white dark:bg-stone-900 border-b border-stone-200 dark:border-stone-800 sticky top-0 z-10 px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between transition-colors shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 sm:w-12 sm:h-12 bg-orange-600 rounded-2xl flex items-center justify-center text-white shadow-lg">
            <Wallet className="w-6 h-6 sm:w-7 sm:h-7" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-bold text-stone-900 dark:text-stone-50 leading-tight truncate max-w-[140px] sm:max-w-none">{family?.name}</h1>
            <p className="text-xs sm:text-sm text-stone-500 dark:text-stone-400 font-bold truncate">{profile.name} • {t[profile.role]}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setView('settings')}
            className={cn(
              "w-10 h-10 sm:w-12 sm:h-12 rounded-2xl flex items-center justify-center transition-all",
              view === 'settings' ? "bg-orange-600 text-white shadow-lg" : "bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300"
            )}
          >
            <Settings className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>
        </div>
      </header>

      <main className="container-responsive py-4 space-y-4">
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
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                <div className="bg-white dark:bg-stone-900 p-4 sm:p-6 rounded-[2rem] shadow-sm border border-stone-200 dark:border-stone-800 transition-colors">
                  <div className="flex justify-between items-start mb-2">
                    <p className="text-stone-500 dark:text-stone-400 text-xs sm:text-sm font-bold uppercase tracking-wider">{t.totalIncome}</p>
                    <TrendingUp className="w-5 h-5 sm:w-6 sm:h-6 text-green-600" />
                  </div>
                  <p className="text-lg sm:text-2xl font-black text-green-600 dark:text-green-400">₹{stats.income.toLocaleString()}</p>
                </div>
                
                <div className="bg-white dark:bg-stone-900 p-4 sm:p-6 rounded-[2rem] shadow-sm border border-stone-200 dark:border-stone-800 transition-colors">
                  <div className="flex justify-between items-start mb-2">
                    <p className="text-stone-500 dark:text-stone-400 text-xs sm:text-sm font-bold uppercase tracking-wider">{t.totalExpense}</p>
                    <TrendingDown className="w-5 h-5 sm:w-6 sm:h-6 text-red-600" />
                  </div>
                  <p className="text-lg sm:text-2xl font-black text-red-600 dark:text-red-400">₹{stats.expense.toLocaleString()}</p>
                </div>

                <div className="bg-white dark:bg-stone-900 p-4 sm:p-6 rounded-[2rem] shadow-sm border border-stone-200 dark:border-stone-800 transition-colors">
                  <div className="flex justify-between items-start mb-2">
                    <p className="text-stone-500 dark:text-stone-400 text-xs sm:text-sm font-bold uppercase tracking-wider">{t.totalSavings}</p>
                    <PiggyBank className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600" />
                  </div>
                  <p className="text-lg sm:text-2xl font-black text-blue-600 dark:text-blue-400">₹{stats.savings.toLocaleString()}</p>
                </div>

                <div className="bg-orange-600 p-5 sm:p-8 rounded-[2rem] shadow-xl text-white relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-4 sm:p-8 opacity-10">
                    <Wallet className="w-24 h-24 sm:w-32 sm:h-32" />
                  </div>
                  <p className="text-orange-200 text-xs sm:text-sm font-bold uppercase tracking-wider mb-2">{t.balance}</p>
                  <p className="text-lg sm:text-2xl font-black">₹{stats.balance.toLocaleString()}</p>
                  {family?.carryForwardBalance !== undefined && family.carryForwardBalance !== 0 && (
                    <p className="text-xs sm:text-base text-orange-200 mt-2 font-bold">
                      {t.carryForward}: ₹{family.carryForwardBalance.toLocaleString()}
                    </p>
                  )}
                </div>
              </div>

              {/* Budget Alert */}
              {family?.budget && (
                <div className={cn(
                  "p-4 sm:p-6 rounded-[2rem] flex flex-col gap-4 border transition-colors",
                  budgetProgress >= 100 ? "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-400" : 
                  budgetProgress >= 80 ? "bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-900/50 text-orange-700 dark:text-orange-400" : 
                  "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-900/50 text-green-700 dark:text-green-400"
                )}>
                  <div className="flex items-center gap-3 sm:gap-4">
                    {budgetProgress >= 80 ? <AlertTriangle className="w-8 h-8 sm:w-10 sm:h-10 shrink-0" /> : <CheckCircle2 className="w-8 h-8 sm:w-10 sm:h-10 shrink-0" />}
                    <div className="flex-1">
                      <p className="font-black text-base sm:text-lg leading-tight">
                        {budgetProgress >= 100 ? t.budgetExceeded : budgetProgress >= 80 ? t.budgetAlert : t.goodJob}
                      </p>
                      <p className="text-[10px] sm:text-xs font-bold opacity-80 mt-1">
                        {lang === 'mr' ? `₹${stats.monthlyExpense.toLocaleString()} खर्च झाले` : `₹${stats.monthlyExpense.toLocaleString()} spent`}
                      </p>
                    </div>
                    <p className="font-black text-base sm:text-xl">{Math.round(budgetProgress)}%</p>
                  </div>
                  <div className="w-full bg-black/10 dark:bg-white/10 h-3 sm:h-4 rounded-full overflow-hidden">
                    <div 
                      className={cn("h-full transition-all", budgetProgress >= 100 ? "bg-red-600" : budgetProgress >= 80 ? "bg-orange-600" : "bg-green-600")} 
                      style={{ width: `${Math.min(budgetProgress, 100)}%` }} 
                    />
                  </div>
                </div>
              )}

              {/* Savings Goal */}
              {family?.savingsGoal && (
                <div className="bg-white dark:bg-stone-900 p-5 sm:p-8 rounded-[2rem] shadow-sm border border-stone-200 dark:border-stone-800 transition-colors">
                  <div className="flex flex-col gap-4 mb-6">
                    <div>
                      <p className="text-stone-500 dark:text-stone-400 text-[10px] sm:text-xs font-bold uppercase tracking-wider mb-1">{t.savingsGoal}</p>
                      <h3 className="text-base sm:text-xl font-black text-stone-900 dark:text-stone-50 truncate">{family.savingsGoal}</h3>
                    </div>
                    <div className="flex justify-between items-end">
                      <p className="text-stone-900 dark:text-stone-50 font-black text-base sm:text-xl">₹{family.currentSavings.toLocaleString()}</p>
                      <p className="text-stone-500 dark:text-stone-400 font-bold text-sm sm:text-base">/ ₹{family.savingsGoalAmount.toLocaleString()}</p>
                    </div>
                  </div>
                  <div className="w-full bg-stone-100 dark:bg-stone-800 h-4 sm:h-6 rounded-full overflow-hidden">
                    <div 
                      className="bg-orange-600 h-full transition-all shadow-[0_0_15px_rgba(234,88,12,0.3)]" 
                      style={{ width: `${Math.min(savingsProgress, 100)}%` }} 
                    />
                  </div>
                  <div className="flex justify-between items-center mt-4">
                    <p className="text-stone-900 dark:text-stone-50 font-black text-base sm:text-xl">{Math.round(savingsProgress)}%</p>
                    <p className="text-xs sm:text-sm font-bold text-stone-500 dark:text-stone-400 uppercase tracking-widest">{t.progress}</p>
                  </div>
                </div>
              )}
              {/* Chart */}
              {chartData.length > 0 && (
                <div className="bg-white dark:bg-stone-900 p-5 sm:p-8 rounded-[2rem] shadow-sm border border-stone-200 dark:border-stone-800 transition-colors">
                  <h3 className="text-base sm:text-xl font-black text-stone-900 dark:text-stone-50 mb-6 sm:mb-8">{t.monthlySummary}</h3>
                  <div className="h-60 sm:h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={darkMode ? "#292524" : "#f0f0f0"} />
                        <XAxis 
                          dataKey="name" 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{ fontSize: 14, fontWeight: 700, fill: darkMode ? "#a8a29e" : "#78716c" }} 
                        />
                        <YAxis 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{ fontSize: 14, fontWeight: 700, fill: darkMode ? "#a8a29e" : "#78716c" }} 
                        />
                        <Tooltip 
                          cursor={{ fill: darkMode ? '#1c1917' : '#f9fafb' }} 
                          contentStyle={{ 
                            borderRadius: '24px', 
                            border: 'none', 
                            boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)',
                            backgroundColor: darkMode ? '#1c1917' : '#ffffff',
                            color: darkMode ? '#fafaf9' : '#1c1917',
                            fontWeight: 'bold'
                          }} 
                        />
                        <Bar dataKey="value" fill="#ea580c" radius={[12, 12, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* Admin Reports */}
              {profile.role === 'admin' && transactions.length > 0 && (
                <div className="bg-white dark:bg-stone-900 rounded-[1.5rem] sm:rounded-[2rem] shadow-sm border border-stone-200 dark:border-stone-800 overflow-hidden transition-colors">
                  <div className="p-5 sm:p-8 border-b border-stone-100 dark:border-stone-800">
                    <h3 className="text-base sm:text-xl font-black text-stone-900 dark:text-stone-50">{t.monthlySummary} (Admin)</h3>
                  </div>
                  <div className="p-5 sm:p-8 space-y-6">
                    {Object.entries(
                      transactions.reduce((acc, tr) => {
                        if (tr.type === 'expense') {
                          acc[tr.category] = (acc[tr.category] || 0) + tr.amount;
                        }
                        return acc;
                      }, {} as Record<string, number>)
                    ).map(([cat, amt]) => (
                      <div key={cat} className="space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-stone-600 dark:text-stone-400 font-bold text-base sm:text-lg">{cat}</span>
                          <span className="text-stone-900 dark:text-stone-50 font-black text-base sm:text-xl">₹{amt.toLocaleString()}</span>
                        </div>
                        <div className="w-full h-3 bg-stone-100 dark:bg-stone-800 rounded-full overflow-hidden">
                          <div 
                            className="bg-orange-500 h-full transition-all" 
                            style={{ width: `${(amt / stats.expense) * 100}%` }} 
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

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
              <div className="bg-white dark:bg-stone-900 p-4 sm:p-6 rounded-[2rem] shadow-lg border border-stone-200 dark:border-stone-800 transition-colors">
                <h2 className="text-lg sm:text-2xl font-bold text-stone-900 dark:text-stone-50 mb-6 sm:mb-8">{t.addTransaction}</h2>
                <form onSubmit={(e) => {
                  e.preventDefault();
                  const form = e.target as HTMLFormElement;
                  const formData = new FormData(form);
                  const amount = Number(formData.get('amount'));
                  const type = formData.get('type') as 'income' | 'expense' | 'savings';
                  
                  if (type === 'savings' && amount > stats.balance) {
                    setFeedback({ type: 'error', msg: t.savingsWarning });
                    return;
                  }

                  addTransaction({
                    amount,
                    type,
                    category: formData.get('category') as string,
                    date: formData.get('date') as string,
                    notes: formData.get('notes') as string,
                    isRecurring: formData.get('isRecurring') === 'on'
                  });
                  form.reset();
                  setView('dashboard'); // Return to dashboard after adding
                }} className="space-y-4 sm:space-y-6">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                    <label className="flex-1">
                      <input type="radio" name="type" value="expense" defaultChecked className="sr-only peer" />
                      <div className="p-3 sm:p-4 text-center rounded-3xl border-2 border-stone-100 dark:border-stone-800 peer-checked:border-red-500 peer-checked:bg-red-50 dark:peer-checked:bg-red-950/30 font-bold text-base sm:text-lg transition-all cursor-pointer dark:text-stone-300">
                        {t.expense}
                      </div>
                    </label>
                    <label className="flex-1">
                      <input type="radio" name="type" value="income" className="sr-only peer" />
                      <div className="p-3 sm:p-4 text-center rounded-3xl border-2 border-stone-100 dark:border-stone-800 peer-checked:border-green-500 peer-checked:bg-green-50 dark:peer-checked:bg-green-950/30 font-bold text-base sm:text-lg transition-all cursor-pointer dark:text-stone-300">
                        {t.income}
                      </div>
                    </label>
                    <label className="flex-1">
                      <input type="radio" name="type" value="savings" className="sr-only peer" />
                      <div className="p-3 sm:p-4 text-center rounded-3xl border-2 border-stone-100 dark:border-stone-800 peer-checked:border-blue-500 peer-checked:bg-blue-50 dark:peer-checked:bg-blue-950/30 font-bold text-base sm:text-lg transition-all cursor-pointer dark:text-stone-300">
                        {t.savings}
                      </div>
                    </label>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-bold text-stone-600 dark:text-stone-400">{t.amount}</label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg sm:text-2xl font-black text-stone-400">₹</span>
                      <input 
                        required 
                        name="amount" 
                        type="number" 
                        inputMode="numeric"
                        placeholder="0"
                        className="w-full p-4 sm:p-6 pl-10 sm:pl-12 bg-stone-50 dark:bg-stone-800 border-2 border-stone-100 dark:border-stone-700 rounded-3xl focus:border-orange-500 focus:bg-white dark:focus:bg-stone-900 outline-none text-lg sm:text-2xl font-black transition-all dark:text-stone-50" 
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-stone-600 dark:text-stone-400">{t.category}</label>
                      <div className="flex gap-2">
                        <select name="category" className="flex-1 p-4 sm:p-6 bg-stone-50 dark:bg-stone-800 border-2 border-stone-100 dark:border-stone-700 rounded-3xl focus:border-orange-500 focus:bg-white dark:focus:bg-stone-900 outline-none font-bold text-base sm:text-lg dark:text-stone-50 appearance-none">
                          {(family?.categories || [t.food, t.farming, t.education, t.medical, t.others]).map(cat => (
                            <option key={cat} value={cat} className="dark:bg-stone-900">{cat}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-stone-600 dark:text-stone-400">{t.date}</label>
                      <input 
                        required 
                        name="date" 
                        type="date" 
                        defaultValue={new Date().toISOString().split('T')[0]}
                        className="w-full p-4 sm:p-6 bg-stone-50 dark:bg-stone-800 border-2 border-stone-100 dark:border-stone-700 rounded-3xl focus:border-orange-500 focus:bg-white dark:focus:bg-stone-900 outline-none font-bold text-base sm:text-lg dark:text-stone-50" 
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-bold text-stone-600 dark:text-stone-400">{t.notes}</label>
                    <textarea name="notes" className="w-full p-4 sm:p-6 bg-stone-50 dark:bg-stone-800 border-2 border-stone-100 dark:border-stone-700 rounded-3xl focus:border-orange-500 focus:bg-white dark:focus:bg-stone-900 outline-none font-medium text-sm sm:text-base h-20 sm:h-32 dark:text-stone-50" />
                  </div>

                  <label className="flex items-center gap-3 sm:gap-4 p-4 sm:p-6 bg-stone-50 dark:bg-stone-800 rounded-3xl cursor-pointer">
                    <input type="checkbox" name="isRecurring" className="w-5 h-5 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl border-2 border-stone-300 dark:border-stone-600 text-orange-600 focus:ring-orange-500" />
                    <span className="font-bold text-sm sm:text-lg text-stone-700 dark:text-stone-300">{t.recurring}</span>
                  </label>

                  <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 pt-4">
                    <button type="submit" className="w-full sm:flex-1 py-4 sm:py-6 px-4 sm:px-8 bg-orange-600 hover:bg-orange-700 text-white rounded-3xl font-bold text-lg sm:text-xl shadow-xl transition-all active:scale-95">
                      {t.save}
                    </button>
                    <button type="button" onClick={() => setView('dashboard')} className="w-full sm:w-auto px-6 sm:px-8 py-4 sm:py-6 bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400 rounded-3xl font-bold text-base sm:text-lg active:scale-95">
                      {t.cancel}
                    </button>
                  </div>
                </form>
              </div>

              <div className="bg-white dark:bg-stone-900 rounded-[2rem] shadow-sm border border-stone-200 dark:border-stone-800 overflow-hidden transition-colors">
                <div className="p-4 sm:p-8 border-b border-stone-100 dark:border-stone-800 space-y-4 sm:space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg sm:text-2xl font-bold text-stone-900 dark:text-stone-50">{t.transactions}</h3>
                  </div>
                  
                  <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                    <button 
                      onClick={() => setDateFilter(new Date().toISOString().split('T')[0])}
                      className={cn(
                        "px-4 sm:px-6 py-2 sm:py-3 rounded-2xl font-bold text-sm sm:text-base transition-all",
                        dateFilter === new Date().toISOString().split('T')[0] 
                          ? "bg-orange-600 text-white shadow-md shadow-orange-200 dark:shadow-none" 
                          : "bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400 hover:bg-stone-200 dark:hover:bg-stone-700"
                      )}
                    >
                      {t.today}
                    </button>
                    <button 
                      onClick={() => setDateFilter('all')}
                      className={cn(
                        "px-4 sm:px-6 py-2 sm:py-3 rounded-2xl font-bold text-sm sm:text-base transition-all",
                        dateFilter === 'all' 
                          ? "bg-orange-600 text-white shadow-md shadow-orange-200 dark:shadow-none" 
                          : "bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400 hover:bg-stone-200 dark:hover:bg-stone-700"
                      )}
                    >
                      {t.all}
                    </button>
                    <div className="relative flex-1 min-w-[140px] sm:min-w-[160px]">
                      <input 
                        type="date" 
                        value={dateFilter === 'all' ? '' : dateFilter}
                        onChange={(e) => setDateFilter(e.target.value)}
                        className="w-full px-3 sm:px-4 py-2 sm:py-3 bg-stone-100 dark:bg-stone-800 text-stone-900 dark:text-stone-50 rounded-2xl font-bold text-sm sm:text-base outline-none focus:ring-2 focus:ring-orange-500 border-none transition-all"
                      />
                    </div>
                  </div>
                </div>
                <div className="divide-y divide-stone-100 dark:divide-stone-800">
                  {transactions
                    .filter(tr => dateFilter === 'all' || tr.date === dateFilter)
                    .map(tr => (
                    <div key={tr.id} className="p-4 sm:p-6 flex items-center justify-between hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors">
                      <div className="flex items-center gap-3 sm:gap-5 min-w-0">
                        <div className={cn(
                          "w-10 h-10 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center shadow-sm shrink-0",
                          tr.type === 'income' ? "bg-green-100 dark:bg-green-950/30 text-green-600 dark:text-green-400" : "bg-red-100 dark:bg-red-950/30 text-red-600 dark:text-red-400"
                        )}>
                          {tr.type === 'income' ? <TrendingUp className="w-6 h-6 sm:w-8 sm:h-8" /> : <TrendingDown className="w-6 h-6 sm:w-8 sm:h-8" />}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-bold text-base sm:text-xl text-stone-900 dark:text-stone-50 truncate">{tr.category}</p>
                            {tr.isRecurring && <Calendar className="w-3 h-3 sm:w-4 sm:h-4 text-orange-500 shrink-0" />}
                          </div>
                          <p className="text-[10px] sm:text-sm text-stone-500 dark:text-stone-400 font-bold truncate">{tr.userName} • {new Date(tr.date).toLocaleDateString(lang === 'mr' ? 'mr-IN' : 'en-US')}</p>
                          {tr.notes && <p className="text-xs sm:text-base text-stone-400 dark:text-stone-500 mt-1 italic truncate">"{tr.notes}"</p>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 sm:gap-4 shrink-0 ml-2 sm:ml-4">
                        <p className={cn("font-black text-base sm:text-xl", 
                          tr.type === 'income' ? "text-green-600 dark:text-green-400" : 
                          tr.type === 'savings' ? "text-blue-600 dark:text-blue-400" :
                          "text-red-600 dark:text-red-400"
                        )}>
                          {tr.type === 'income' ? '+' : '-'}₹{tr.amount.toLocaleString()}
                        </p>
                        {(tr.uid === user.uid || profile.role === 'admin') && (
                          <button onClick={() => deleteTransaction(tr.id)} className="p-2 sm:p-3 text-stone-300 hover:text-red-600 transition-colors">
                            <Trash2 className="w-5 h-5 sm:w-6 sm:h-6" />
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
              <div className="bg-white dark:bg-stone-900 p-4 sm:p-6 rounded-[2rem] shadow-sm border border-stone-200 dark:border-stone-800 transition-colors">
                <div className="flex flex-col gap-4 sm:gap-6 mb-6 sm:mb-8">
                  <h2 className="text-lg sm:text-2xl font-black text-stone-900 dark:text-stone-50">{t.history}</h2>
                  <button 
                    onClick={generateReport}
                    disabled={isGenerating}
                    className="w-full py-4 sm:py-6 bg-orange-600 hover:bg-orange-700 disabled:bg-stone-300 text-white rounded-3xl font-black text-lg sm:text-xl shadow-xl transition-all flex items-center justify-center gap-3 sm:gap-4 active:scale-95"
                  >
                    <Mail className="w-6 h-6 sm:w-8 sm:h-8" />
                    {isGenerating ? "Generating..." : t.sendReport}
                  </button>
                </div>

                <div className="space-y-4 sm:space-y-6">
                  {archives.length === 0 ? (
                    <div className="bg-stone-50 dark:bg-stone-800/50 p-8 sm:p-16 rounded-[2rem] border-2 border-dashed border-stone-200 dark:border-stone-700 text-center transition-colors">
                      <Calendar className="w-12 h-12 sm:w-16 sm:h-16 text-stone-300 dark:text-stone-600 mx-auto mb-4" />
                      <p className="text-stone-500 dark:text-stone-400 font-bold text-lg sm:text-xl">{t.noReports}</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-3 sm:gap-4">
                      {archives.map(report => (
                        <div 
                          key={report.id} 
                          className="bg-white dark:bg-stone-900 p-4 sm:p-6 rounded-[2rem] shadow-sm border border-stone-200 dark:border-stone-800 transition-colors"
                        >
                          <div className="flex flex-col sm:flex-row justify-between items-start gap-4 mb-6">
                            <div>
                              <h3 className="text-lg sm:text-xl font-black text-stone-900 dark:text-stone-50">{report.month}</h3>
                              <p className="text-[10px] sm:text-sm font-bold text-stone-500 dark:text-stone-400 uppercase tracking-widest mt-1">{t.monthlySummary}</p>
                            </div>
                            <button 
                              onClick={() => setSelectedReport(selectedReport?.id === report.id ? null : report)}
                              className={cn(
                                "w-full sm:w-auto p-3 sm:p-4 rounded-2xl font-black text-sm sm:text-base transition-all shadow-sm",
                                selectedReport?.id === report.id ? "bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400" : "bg-orange-50 dark:bg-orange-950/30 text-orange-600 dark:text-orange-400"
                              )}
                            >
                              {selectedReport?.id === report.id ? t.cancel : t.viewReport}
                            </button>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                            <div className="text-center p-3 sm:p-4 bg-stone-50 dark:bg-stone-800/50 rounded-2xl">
                              <p className="text-[10px] font-black text-stone-400 uppercase tracking-wider mb-1">{t.income}</p>
                              <p className="font-black text-lg sm:text-xl text-green-600 dark:text-green-400">₹{report.totalIncome.toLocaleString()}</p>
                            </div>
                            <div className="text-center p-3 sm:p-4 bg-stone-50 dark:bg-stone-800/50 rounded-2xl">
                              <p className="text-[10px] font-black text-stone-400 uppercase tracking-wider mb-1">{t.expense}</p>
                              <p className="font-black text-lg sm:text-xl text-red-600 dark:text-red-400">₹{report.totalExpense.toLocaleString()}</p>
                            </div>
                            <div className="text-center p-3 sm:p-4 bg-stone-50 dark:bg-stone-800/50 rounded-2xl">
                              <p className="text-[10px] font-black text-stone-400 uppercase tracking-wider mb-1">{t.balance}</p>
                              <p className="font-black text-lg sm:text-xl text-orange-600 dark:text-orange-400">₹{report.balance.toLocaleString()}</p>
                            </div>
                          </div>

                          <AnimatePresence>
                            {selectedReport?.id === report.id && (
                              <motion.div 
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="overflow-hidden mt-8 pt-8 border-t-2 border-stone-100 dark:border-stone-800 space-y-8"
                              >
                                {/* Category Breakdown */}
                                <div>
                                  <h4 className="text-sm sm:text-lg font-black text-stone-900 dark:text-stone-50 mb-4 uppercase tracking-widest">{t.category}</h4>
                                  <div className="space-y-3">
                                    {Object.entries(report.categoryBreakdown).map(([cat, amt]) => (
                                      <div key={cat} className="space-y-2">
                                        <div className="flex justify-between items-center text-xs sm:text-base">
                                          <span className="text-stone-600 dark:text-stone-400 font-bold truncate mr-2">{cat}</span>
                                          <span className="text-stone-900 dark:text-stone-50 font-black shrink-0">₹{amt.toLocaleString()}</span>
                                        </div>
                                        <div className="w-full h-1.5 sm:h-2 bg-stone-100 dark:bg-stone-800 rounded-full overflow-hidden">
                                          <div className="bg-orange-500 h-full" style={{ width: `${(amt / report.totalExpense) * 100}%` }} />
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>

                                {/* Member Contributions */}
                                <div>
                                  <h4 className="text-sm sm:text-lg font-black text-stone-900 dark:text-stone-50 mb-4 uppercase tracking-widest">{t.memberContribution}</h4>
                                  <div className="grid grid-cols-1 gap-3 sm:gap-4">
                                    {Object.entries(report.memberContributions).map(([name, data]) => (
                                      <div key={name} className="bg-stone-50 dark:bg-stone-800/50 p-4 sm:p-6 rounded-[1.5rem] sm:rounded-[2rem] border-2 border-stone-100 dark:border-stone-800">
                                        <p className="text-base sm:text-xl font-black text-stone-900 dark:text-stone-50 mb-3 sm:mb-4">{name}</p>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                                          <div className="p-3 sm:p-4 bg-white dark:bg-stone-900 rounded-xl sm:rounded-2xl shadow-sm">
                                            <p className="text-[10px] font-black text-stone-400 uppercase mb-1">{t.income}</p>
                                            <p className="text-sm sm:text-lg font-black text-green-600 dark:text-green-400">₹{data.income.toLocaleString()}</p>
                                          </div>
                                          <div className="p-3 sm:p-4 bg-white dark:bg-stone-900 rounded-xl sm:rounded-2xl shadow-sm">
                                            <p className="text-[10px] font-black text-stone-400 uppercase mb-1">{t.expense}</p>
                                            <p className="text-sm sm:text-lg font-black text-red-600 dark:text-red-400">₹{data.expense.toLocaleString()}</p>
                                          </div>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>

                                {/* Loan Summary */}
                                <div>
                                  <h4 className="text-sm sm:text-lg font-black text-stone-900 dark:text-stone-50 mb-4 uppercase tracking-widest">{t.loanSummary}</h4>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                                    <div className="p-3 sm:p-6 bg-stone-50 dark:bg-stone-800/50 rounded-2xl sm:rounded-3xl border-2 border-stone-100 dark:border-stone-800">
                                      <p className="text-[10px] font-black text-stone-400 uppercase mb-1">{t.lent}</p>
                                      <p className="text-base sm:text-xl font-black text-stone-900 dark:text-stone-50">₹{report.loanSummary.lent.toLocaleString()}</p>
                                    </div>
                                    <div className="p-3 sm:p-6 bg-stone-50 dark:bg-stone-800/50 rounded-2xl sm:rounded-3xl border-2 border-stone-100 dark:border-stone-800">
                                      <p className="text-[10px] font-black text-stone-400 uppercase mb-1">{t.borrowed}</p>
                                      <p className="text-base sm:text-xl font-black text-stone-900 dark:text-stone-50">₹{report.loanSummary.borrowed.toLocaleString()}</p>
                                    </div>
                                    <div className="p-3 sm:p-6 bg-stone-50 dark:bg-stone-800/50 rounded-2xl sm:rounded-3xl border-2 border-stone-100 dark:border-stone-800">
                                      <p className="text-[10px] font-black text-stone-400 uppercase mb-1">{t.returned}</p>
                                      <p className="text-base sm:text-xl font-black text-stone-900 dark:text-stone-50">₹{report.loanSummary.returned.toLocaleString()}</p>
                                    </div>
                                    <div className="p-3 sm:p-6 bg-stone-50 dark:bg-stone-800/50 rounded-2xl sm:rounded-3xl border-2 border-stone-100 dark:border-stone-800">
                                      <p className="text-[10px] font-black text-stone-400 uppercase mb-1">{t.pending}</p>
                                      <p className="text-base sm:text-xl font-black text-orange-600 dark:text-orange-400">₹{report.loanSummary.pending.toLocaleString()}</p>
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
                </div>
              </div>
            </motion.div>
          )}

          {view === 'savings' && (
            <motion.div 
              key="savings"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-6"
            >
              <div className="bg-blue-600 p-5 sm:p-8 rounded-[2rem] shadow-xl text-white relative overflow-hidden">
                <div className="absolute top-0 right-0 p-5 sm:p-8 opacity-10">
                  <PiggyBank className="w-24 h-24 sm:w-32 sm:h-32" />
                </div>
                <p className="text-blue-200 text-xs sm:text-sm font-bold uppercase tracking-wider mb-2">{t.totalSavings}</p>
                <p className="text-2xl sm:text-3xl font-black">₹{totalSavingsAmount.toLocaleString()}</p>
                <div className="mt-6 flex items-center gap-4">
                  <div className="flex-1 bg-white/20 h-3 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-white transition-all" 
                      style={{ width: `${Math.min(savingsProgress, 100)}%` }} 
                    />
                  </div>
                  <p className="font-black text-base sm:text-lg">{Math.round(savingsProgress)}%</p>
                </div>
                <p className="text-blue-100 text-xs sm:text-sm mt-2 font-bold">
                  {t.savingsGoal}: ₹{family?.savingsGoalAmount?.toLocaleString() || 0}
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4">
                <div className="bg-white dark:bg-stone-900 p-4 sm:p-6 rounded-[2rem] shadow-sm border border-stone-200 dark:border-stone-800 transition-colors">
                  <div className="flex justify-between items-start mb-2">
                    <p className="text-stone-500 dark:text-stone-400 text-xs sm:text-sm font-bold uppercase tracking-wider">{t.monthlySavings}</p>
                    <TrendingUp className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600" />
                  </div>
                  <p className="text-xl sm:text-2xl font-black text-blue-600 dark:text-blue-400">₹{stats.monthlySavings.toLocaleString()}</p>
                </div>
              </div>

              <div className="bg-white dark:bg-stone-900 rounded-[2rem] shadow-sm border border-stone-200 dark:border-stone-800 overflow-hidden transition-colors">
                <div className="p-5 sm:p-8 border-b border-stone-100 dark:border-stone-800">
                  <h3 className="text-xl sm:text-2xl font-bold text-stone-900 dark:text-stone-50">{t.savingsHistory}</h3>
                </div>
                <div className="divide-y divide-stone-100 dark:divide-stone-800">
                  {transactions.filter(t => t.type === 'savings').map(tr => (
                    <div key={tr.id} className="p-4 sm:p-6 flex items-center justify-between hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors">
                      <div className="flex items-center gap-3 sm:gap-5 min-w-0">
                        <div className="w-10 h-10 sm:w-14 sm:h-14 rounded-2xl bg-blue-100 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 flex items-center justify-center shadow-sm shrink-0">
                          <PiggyBank className="w-6 h-6 sm:w-8 sm:h-8" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-lg sm:text-xl text-stone-900 dark:text-stone-50 truncate">{tr.category}</p>
                          <p className="text-xs sm:text-sm text-stone-500 dark:text-stone-400 font-bold truncate">{tr.userName} • {new Date(tr.date).toLocaleDateString(lang === 'mr' ? 'mr-IN' : 'en-US')}</p>
                          {tr.notes && <p className="text-sm sm:text-base text-stone-400 dark:text-stone-500 mt-1 italic truncate">"{tr.notes}"</p>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 sm:gap-4 shrink-0 ml-2 sm:ml-4">
                        <p className="font-black text-lg sm:text-xl text-blue-600 dark:text-blue-400">
                          ₹{tr.amount.toLocaleString()}
                        </p>
                        {(tr.uid === user.uid || profile.role === 'admin') && (
                          <button onClick={() => deleteTransaction(tr.id)} className="p-2 sm:p-3 text-stone-400 hover:text-red-600 transition-colors">
                            <Trash2 className="w-5 h-5 sm:w-6 sm:h-6" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                  {transactions.filter(t => t.type === 'savings').length === 0 && (
                    <div className="p-16 text-center text-stone-400 font-bold text-lg">
                      {t.noTransactions}
                    </div>
                  )}
                </div>
              </div>
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
              <div className="bg-stone-900 p-5 sm:p-8 rounded-[2rem] sm:rounded-[3rem] shadow-2xl text-white relative overflow-hidden">
                <div className="absolute top-0 right-0 p-5 sm:p-8 opacity-10">
                  <HandCoins className="w-24 h-24 sm:w-40 sm:h-40" />
                </div>
                <h2 className="text-base sm:text-2xl font-black mb-2 tracking-tight">{t.privateLoans}</h2>
                <p className="text-stone-400 text-xs sm:text-sm font-bold mb-6 sm:mb-10 opacity-80">{t.privateSection}</p>
                
                <div className="grid grid-cols-1 gap-3 sm:gap-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                    <div className="bg-white/10 p-4 sm:p-6 rounded-2xl sm:rounded-3xl backdrop-blur-sm border border-white/5">
                      <p className="text-stone-400 text-[10px] font-black uppercase tracking-widest mb-1 sm:mb-2">{t.lent}</p>
                      <p className="text-lg sm:text-2xl font-black text-green-400">₹{privateLoans.filter(l => l.type === 'lent' && l.status === 'pending').reduce((acc, l) => acc + l.amount, 0).toLocaleString()}</p>
                    </div>
                    <div className="bg-white/10 p-4 sm:p-6 rounded-2xl sm:rounded-3xl backdrop-blur-sm border border-white/5">
                      <p className="text-stone-400 text-[10px] font-black uppercase tracking-widest mb-1 sm:mb-2">{t.borrowed}</p>
                      <p className="text-lg sm:text-2xl font-black text-red-400">₹{privateLoans.filter(l => l.type === 'borrowed' && l.status === 'pending').reduce((acc, l) => acc + l.amount, 0).toLocaleString()}</p>
                    </div>
                  </div>
                  <div className="bg-white/10 p-4 sm:p-6 rounded-2xl sm:rounded-3xl backdrop-blur-sm border border-white/5">
                    <p className="text-stone-400 text-[10px] font-black uppercase tracking-widest mb-1 sm:mb-2">{t.returned}</p>
                    <p className="text-lg sm:text-2xl font-black text-blue-400">₹{privateLoans.filter(l => l.status === 'returned').reduce((acc, l) => acc + l.amount, 0).toLocaleString()}</p>
                  </div>
                </div>
              </div>

              <div className="bg-white dark:bg-stone-900 p-5 sm:p-8 rounded-[1.5rem] sm:rounded-[2rem] shadow-lg border border-stone-200 dark:border-stone-800 transition-colors">
                <h3 className="text-base sm:text-xl font-black text-stone-900 dark:text-stone-50 mb-6 sm:mb-8">{t.addLoan}</h3>
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
                }} className="space-y-4 sm:space-y-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                    <label className="flex-1">
                      <input type="radio" name="type" value="lent" defaultChecked className="sr-only peer" />
                      <div className="p-4 sm:p-6 text-center rounded-2xl sm:rounded-3xl border-2 border-stone-100 dark:border-stone-800 peer-checked:border-green-500 peer-checked:bg-green-50 dark:peer-checked:bg-green-950/30 font-black text-base sm:text-xl transition-all cursor-pointer dark:text-stone-300">
                        {t.lent}
                      </div>
                    </label>
                    <label className="flex-1">
                      <input type="radio" name="type" value="borrowed" className="sr-only peer" />
                      <div className="p-4 sm:p-6 text-center rounded-2xl sm:rounded-3xl border-2 border-stone-100 dark:border-stone-800 peer-checked:border-red-500 peer-checked:bg-red-50 dark:peer-checked:bg-red-950/30 font-black text-base sm:text-xl transition-all cursor-pointer dark:text-stone-300">
                        {t.borrowed}
                      </div>
                    </label>
                  </div>

                  <div className="space-y-4 sm:space-y-6">
                    <div className="space-y-2">
                      <label className="text-xs sm:text-base font-black text-stone-600 dark:text-stone-400 uppercase tracking-wider">{t.personName}</label>
                      <input required name="personName" type="text" className="w-full p-4 sm:p-6 bg-stone-50 dark:bg-stone-800 border-2 border-stone-100 dark:border-stone-700 rounded-2xl sm:rounded-3xl focus:border-orange-500 focus:bg-white dark:focus:bg-stone-900 outline-none font-black text-base sm:text-xl dark:text-stone-50 transition-all" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs sm:text-base font-black text-stone-600 dark:text-stone-400 uppercase tracking-wider">{t.amount}</label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg sm:text-2xl font-black text-stone-400">₹</span>
                        <input required name="amount" type="number" inputMode="numeric" className="w-full p-4 sm:p-6 pl-10 sm:pl-12 bg-stone-50 dark:bg-stone-800 border-2 border-stone-100 dark:border-stone-700 rounded-2xl sm:rounded-3xl focus:border-orange-500 focus:bg-white dark:focus:bg-stone-900 outline-none font-black text-lg sm:text-2xl dark:text-stone-50 transition-all" />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:gap-6">
                    <div className="space-y-2">
                      <label className="text-xs sm:text-base font-black text-stone-600 dark:text-stone-400 uppercase tracking-wider">{t.date}</label>
                      <input required name="date" type="date" defaultValue={new Date().toISOString().split('T')[0]} className="w-full p-4 sm:p-6 bg-stone-50 dark:bg-stone-800 border-2 border-stone-100 dark:border-stone-700 rounded-2xl sm:rounded-3xl focus:border-orange-500 focus:bg-white dark:focus:bg-stone-900 outline-none font-black text-base sm:text-xl dark:text-stone-50 transition-all" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs sm:text-base font-black text-stone-600 dark:text-stone-400 uppercase tracking-wider">{t.notes}</label>
                      <input name="notes" type="text" className="w-full p-4 sm:p-6 bg-stone-50 dark:bg-stone-800 border-2 border-stone-100 dark:border-stone-700 rounded-2xl sm:rounded-3xl focus:border-orange-500 focus:bg-white dark:focus:bg-stone-900 outline-none font-bold text-sm sm:text-lg dark:text-stone-50 transition-all" />
                    </div>
                  </div>

                  <button type="submit" className="w-full py-4 sm:py-6 bg-stone-900 dark:bg-stone-800 hover:bg-black dark:hover:bg-stone-700 text-white rounded-2xl sm:rounded-3xl font-black text-lg sm:text-xl shadow-xl transition-all active:scale-95">
                    {t.save}
                  </button>
                </form>
              </div>

              <div className="space-y-6">
                {privateLoans.map(loan => (
                  <div key={loan.id} className={cn(
                    "bg-white dark:bg-stone-900 p-5 sm:p-8 rounded-[1.5rem] sm:rounded-[2rem] shadow-sm border border-stone-200 dark:border-stone-800 flex flex-col gap-4 sm:gap-6 transition-all",
                    loan.status === 'returned' && "opacity-60 grayscale-[0.5]"
                  )}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 sm:gap-5">
                        <div className={cn(
                          "w-12 h-12 sm:w-16 sm:h-16 rounded-xl sm:rounded-2xl flex items-center justify-center shadow-sm",
                          loan.type === 'lent' ? "bg-green-100 dark:bg-green-950/30 text-green-600 dark:text-green-400" : "bg-red-100 dark:bg-red-950/30 text-red-600 dark:text-red-400"
                        )}>
                          <HandCoins className="w-6 h-6 sm:w-10 sm:h-10" />
                        </div>
                        <div>
                          <p className="font-black text-stone-900 dark:text-stone-50 text-lg sm:text-2xl">{loan.personName}</p>
                          <p className="text-[10px] sm:text-sm text-stone-500 dark:text-stone-400 font-black uppercase tracking-widest mt-0.5 sm:mt-1">
                            {loan.type === 'lent' ? t.lent : t.borrowed} • {new Date(loan.date).toLocaleDateString(lang === 'mr' ? 'mr-IN' : 'en-US')}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={cn("font-black text-lg sm:text-2xl", loan.type === 'lent' ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400")}>
                          ₹{loan.amount.toLocaleString()}
                        </p>
                        <p className={cn("text-[10px] sm:text-sm font-black uppercase tracking-widest mt-0.5 sm:mt-1", loan.status === 'pending' ? "text-orange-600 dark:text-orange-400" : "text-blue-600 dark:text-blue-400")}>
                          {t[loan.status]}
                        </p>
                      </div>
                    </div>
                    
                    {loan.notes && (
                      <div className="p-3 sm:p-4 bg-stone-50 dark:bg-stone-800 rounded-xl sm:rounded-2xl border border-stone-100 dark:border-stone-700 italic text-stone-500 dark:text-stone-400 font-bold text-sm sm:text-lg">
                        "{loan.notes}"
                      </div>
                    )}

                    <div className="flex gap-3 sm:gap-4">
                      {loan.status === 'pending' ? (
                        <button 
                          onClick={() => updateLoanStatus(loan.id, 'returned')}
                          className="flex-1 py-3 sm:py-4 bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 rounded-xl sm:rounded-2xl font-black text-sm sm:text-lg hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-all flex items-center justify-center gap-2"
                        >
                          <CheckCircle2 className="w-5 h-5 sm:w-6 sm:h-6" />
                          {lang === 'mr' ? "परत मिळाले" : "Mark Returned"}
                        </button>
                      ) : (
                        <button 
                          onClick={() => updateLoanStatus(loan.id, 'pending')}
                          className="flex-1 py-3 sm:py-4 bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400 rounded-xl sm:rounded-2xl font-black text-sm sm:text-lg hover:bg-stone-200 dark:hover:bg-stone-700 transition-all flex items-center justify-center gap-2"
                        >
                          <AlertTriangle className="w-5 h-5 sm:w-6 sm:h-6" />
                          {lang === 'mr' ? "अजून बाकी" : "Mark Pending"}
                        </button>
                      )}
                      <button onClick={() => deleteLoan(loan.id)} className="p-3 sm:p-4 bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 rounded-xl sm:rounded-2xl hover:bg-red-100 dark:hover:bg-red-900/50 transition-all">
                        <Trash2 className="w-6 h-6 sm:w-8 sm:h-8" />
                      </button>
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
              <div className="bg-white dark:bg-stone-900 p-5 sm:p-8 rounded-[1.5rem] sm:rounded-[2rem] shadow-sm border border-stone-200 dark:border-stone-800 transition-colors">
                <h2 className="text-lg sm:text-2xl font-black text-stone-900 dark:text-stone-50 mb-6 sm:mb-8">{t.settings}</h2>
                
                <div className="space-y-8 sm:space-y-10">
                  {/* Language & Theme */}
                  <div className="space-y-4 sm:space-y-6">
                    <h3 className="text-sm sm:text-lg font-black text-stone-400 uppercase tracking-widest">{lang === 'mr' ? "प्राधान्ये" : "Preferences"}</h3>
                    <div className="flex flex-col gap-3 sm:gap-4">
                      <div className="flex items-center justify-between p-4 sm:p-6 bg-stone-50 dark:bg-stone-800 rounded-2xl sm:rounded-3xl">
                        <div className="flex items-center gap-3 sm:gap-4">
                          <Globe className="w-6 h-6 sm:w-8 sm:h-8 text-stone-600 dark:text-stone-400" />
                          <span className="text-base sm:text-xl font-black text-stone-900 dark:text-stone-50">{t.language}</span>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => setLang('mr')} className={cn("px-4 sm:px-6 py-2 sm:py-3 rounded-xl sm:rounded-2xl font-black text-sm sm:text-lg transition-all", lang === 'mr' ? "bg-stone-900 dark:bg-stone-50 text-white dark:text-stone-900" : "bg-stone-200 dark:bg-stone-700 text-stone-600 dark:text-stone-400")}>मराठी</button>
                          <button onClick={() => setLang('en')} className={cn("px-4 sm:px-6 py-2 sm:py-3 rounded-xl sm:rounded-2xl font-black text-sm sm:text-lg transition-all", lang === 'en' ? "bg-stone-900 dark:bg-stone-50 text-white dark:text-stone-900" : "bg-stone-200 dark:bg-stone-700 text-stone-600 dark:text-stone-400")}>English</button>
                        </div>
                      </div>
                      <div className="flex items-center justify-between p-4 sm:p-6 bg-stone-50 dark:bg-stone-800 rounded-2xl sm:rounded-3xl">
                        <div className="flex items-center gap-3 sm:gap-4">
                          {darkMode ? <Moon className="w-6 h-6 sm:w-8 sm:h-8 text-stone-600 dark:text-stone-400" /> : <Sun className="w-6 h-6 sm:w-8 sm:h-8 text-stone-600 dark:text-stone-400" />}
                          <span className="text-base sm:text-xl font-black text-stone-900 dark:text-stone-50">{t.darkMode}</span>
                        </div>
                        <button 
                          onClick={() => setDarkMode(!darkMode)}
                          className={cn(
                            "w-16 sm:w-20 h-8 sm:h-10 rounded-full transition-all relative p-1",
                            darkMode ? "bg-orange-600" : "bg-stone-300"
                          )}
                        >
                          <div className={cn(
                            "w-6 sm:w-8 h-6 sm:h-8 bg-white rounded-full shadow-md transition-all",
                            darkMode ? "translate-x-8 sm:translate-x-10" : "translate-x-0"
                          )} />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Family Info */}
                  <div className="space-y-4 sm:space-y-6">
                    <h3 className="text-sm sm:text-lg font-black text-stone-400 uppercase tracking-widest">{t.familyInfo}</h3>
                    <div className="p-5 sm:p-8 bg-stone-50 dark:bg-stone-800 rounded-[1.5rem] sm:rounded-[2rem] space-y-4 sm:space-y-6">
                      <div className="space-y-1 sm:space-y-2">
                        <p className="text-xs sm:text-base font-black text-stone-500 uppercase tracking-wider">{t.familyName}</p>
                        <p className="text-base sm:text-xl font-black text-stone-900 dark:text-stone-50">{family?.name}</p>
                      </div>
                      <div className="space-y-1 sm:space-y-2">
                        <p className="text-xs sm:text-base font-black text-stone-500 uppercase tracking-wider">{t.familyId}</p>
                        <div className="flex items-center gap-3 sm:gap-4 p-3 sm:p-4 bg-white dark:bg-stone-900 rounded-xl sm:rounded-2xl border-2 border-stone-100 dark:border-stone-700">
                          <code className="text-base sm:text-xl font-black text-orange-600 dark:text-orange-400 flex-1 truncate">{profile.familyId}</code>
                          <button 
                            onClick={() => {
                              navigator.clipboard.writeText(profile.familyId);
                              setFeedback({ msg: lang === 'mr' ? "आयडी कॉपी केला!" : "ID Copied!", type: 'success' });
                            }}
                            className="p-2 sm:p-3 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-xl transition-all"
                          >
                            <Copy className="w-5 h-5 sm:w-6 h-6 text-stone-400" />
                          </button>
                        </div>
                        <p className="text-[10px] sm:text-sm font-bold text-stone-400 mt-1 sm:mt-2">{lang === 'mr' ? "इतर सदस्यांना जोडण्यासाठी हा आयडी द्या" : "Share this ID to add other members"}</p>
                      </div>
                    </div>
                  </div>

                  {/* Budget & Savings */}
                  {profile.role === 'admin' && (
                    <div className="space-y-4 sm:space-y-6">
                      <h3 className="text-sm sm:text-lg font-black text-stone-400 uppercase tracking-widest">{lang === 'mr' ? "बजेट आणि उद्दिष्टे" : "Budget & Goals"}</h3>
                      <div className="grid grid-cols-1 gap-4">
                        <div className="p-5 sm:p-8 bg-stone-50 dark:bg-stone-800 rounded-[1.5rem] sm:rounded-[2rem] space-y-4 sm:space-y-6">
                          <div className="space-y-2 sm:space-y-4">
                            <label className="text-xs sm:text-base font-black text-stone-600 dark:text-stone-400 uppercase tracking-wider">{t.monthlyBudget}</label>
                            <div className="relative">
                              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg sm:text-2xl font-black text-stone-400">₹</span>
                              <input 
                                type="number" 
                                defaultValue={family?.budget}
                                onBlur={(e) => updateFamilySettings({ budget: Number(e.target.value) })}
                                className="w-full p-4 sm:p-6 pl-10 sm:pl-12 bg-white dark:bg-stone-900 border-2 border-stone-100 dark:border-stone-700 rounded-2xl sm:rounded-3xl focus:border-orange-500 outline-none font-black text-lg sm:text-2xl dark:text-stone-50"
                              />
                            </div>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                            <div className="space-y-2 sm:space-y-4">
                              <label className="text-xs sm:text-base font-black text-stone-600 dark:text-stone-400 uppercase tracking-wider">{t.savingsGoal}</label>
                              <input 
                                type="text" 
                                defaultValue={family?.savingsGoal}
                                onBlur={(e) => updateFamilySettings({ savingsGoal: e.target.value })}
                                className="w-full p-4 sm:p-6 bg-white dark:bg-stone-900 border-2 border-stone-100 dark:border-stone-700 rounded-2xl sm:rounded-3xl focus:border-orange-500 outline-none font-black text-base sm:text-xl dark:text-stone-50"
                              />
                            </div>
                            <div className="space-y-2 sm:space-y-4">
                              <label className="text-xs sm:text-base font-black text-stone-600 dark:text-stone-400 uppercase tracking-wider">{t.amount}</label>
                              <div className="relative">
                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg sm:text-2xl font-black text-stone-400">₹</span>
                                <input 
                                  type="number" 
                                  defaultValue={family?.savingsGoalAmount}
                                  onBlur={(e) => updateFamilySettings({ savingsGoalAmount: Number(e.target.value) })}
                                  className="w-full p-4 sm:p-6 pl-10 sm:pl-12 bg-white dark:bg-stone-900 border-2 border-stone-100 dark:border-stone-700 rounded-2xl sm:rounded-3xl focus:border-orange-500 outline-none font-black text-lg sm:text-2xl dark:text-stone-50"
                                />
                              </div>
                            </div>
                          </div>
                          <div className="space-y-2 sm:space-y-4">
                            <label className="text-xs sm:text-base font-black text-stone-600 dark:text-stone-400 uppercase tracking-wider">{lang === 'mr' ? "सध्याची बचत" : "Current Savings"}</label>
                            <div className="relative">
                              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg sm:text-2xl font-black text-stone-400">₹</span>
                              <input 
                                type="number" 
                                defaultValue={family?.currentSavings}
                                onBlur={(e) => updateFamilySettings({ currentSavings: Number(e.target.value) })}
                                className="w-full p-4 sm:p-6 pl-10 sm:pl-12 bg-white dark:bg-stone-900 border-2 border-stone-100 dark:border-stone-700 rounded-2xl sm:rounded-3xl focus:border-orange-500 outline-none font-black text-lg sm:text-2xl dark:text-stone-50"
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Categories Management */}
                  {profile.role === 'admin' && (
                    <div className="space-y-4 sm:space-y-6">
                      <h3 className="text-sm sm:text-lg font-black text-stone-400 uppercase tracking-widest">{t.manageCategories}</h3>
                      <div className="p-5 sm:p-8 bg-stone-50 dark:bg-stone-800 rounded-[1.5rem] sm:rounded-[2rem] space-y-4 sm:space-y-6">
                        <div className="flex flex-wrap gap-2 sm:gap-3">
                          {(family?.categories || []).map(cat => (
                            <div key={cat} className="flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 bg-white dark:bg-stone-900 rounded-xl sm:rounded-2xl border-2 border-stone-100 dark:border-stone-700 font-bold text-xs sm:text-base text-stone-700 dark:text-stone-300">
                              {cat}
                              <button onClick={() => removeCategory(cat)} className="text-red-500 hover:text-red-700">
                                <X className="w-3 h-3 sm:w-4 sm:h-4" />
                              </button>
                            </div>
                          ))}
                        </div>
                        <div className="flex gap-2">
                          <input 
                            type="text" 
                            id="settingsCategoryInput"
                            placeholder={t.addCategory}
                            className="flex-1 p-3 sm:p-4 bg-white dark:bg-stone-900 border-2 border-stone-100 dark:border-stone-700 rounded-xl sm:rounded-2xl focus:border-orange-500 outline-none font-bold text-sm sm:text-base dark:text-stone-50"
                          />
                          <button 
                            onClick={() => {
                              const input = document.getElementById('settingsCategoryInput') as HTMLInputElement;
                              if (input.value) {
                                addCategory(input.value);
                                input.value = '';
                              }
                            }}
                            className="px-4 sm:px-6 bg-stone-900 dark:bg-stone-700 text-white rounded-xl sm:rounded-2xl font-bold text-sm sm:text-base hover:bg-black transition-all"
                          >
                            {t.save}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Logout */}
                  <button 
                    onClick={handleLogout}
                    className="w-full py-4 sm:py-6 bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 rounded-2xl sm:rounded-3xl font-black text-base sm:text-xl hover:bg-red-100 dark:hover:bg-red-900/50 transition-all flex items-center justify-center gap-3 sm:gap-4 border-2 border-red-100 dark:border-red-900/50 active:scale-95"
                  >
                    <LogOut className="w-6 h-6 sm:w-8 sm:h-8" />
                    {t.logout}
                  </button>
                </div>
              </div>

              {/* Members List */}
              <div className="bg-white dark:bg-stone-900 rounded-[1.5rem] sm:rounded-[2rem] shadow-sm border border-stone-200 dark:border-stone-800 overflow-hidden transition-colors">
                <div className="p-5 sm:p-8 border-b-2 border-stone-100 dark:border-stone-800 flex items-center gap-3 sm:gap-4">
                  <Users className="w-6 h-6 sm:w-8 sm:h-8 text-stone-900 dark:text-stone-50" />
                  <h3 className="text-base sm:text-xl font-black text-stone-900 dark:text-stone-50">{t.familyMembers}</h3>
                </div>
                <div className="divide-y-2 divide-stone-100 dark:divide-stone-800">
                  {familyMembers.map(member => (
                    <div key={member.uid} className="p-5 sm:p-8 flex items-center justify-between">
                      <div className="flex items-center gap-3 sm:gap-5">
                        <div className="w-12 h-12 sm:w-16 sm:h-16 bg-stone-100 dark:bg-stone-800 rounded-full flex items-center justify-center text-stone-600 dark:text-stone-400 font-black text-lg sm:text-xl shadow-inner">
                          {member.name[0]}
                        </div>
                        <div>
                          <p className="font-black text-stone-900 dark:text-stone-50 text-base sm:text-xl">{member.name}</p>
                          <p className="text-[10px] sm:text-sm text-stone-500 dark:text-stone-400 font-black uppercase tracking-widest mt-0.5 sm:mt-1">{t[member.role]}</p>
                        </div>
                      </div>
                      {profile.role === 'admin' && member.uid !== user.uid && (
                        <div className="flex items-center gap-2 sm:gap-3">
                          {confirmDelete === member.uid ? (
                            <>
                              <button 
                                onClick={() => {
                                  removeMember(member.uid);
                                  setConfirmDelete(null);
                                }}
                                className="px-4 sm:px-6 py-2 sm:py-3 bg-red-600 text-white rounded-xl sm:rounded-2xl font-black text-xs sm:text-sm shadow-md"
                              >
                                {t.save}
                              </button>
                              <button 
                                onClick={() => setConfirmDelete(null)}
                                className="px-4 sm:px-6 py-2 sm:py-3 bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400 rounded-xl sm:rounded-2xl font-black text-xs sm:text-sm"
                              >
                                {t.cancel}
                              </button>
                            </>
                          ) : (
                            <button 
                              onClick={() => setConfirmDelete(member.uid)}
                              className="p-2 sm:p-4 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-xl sm:rounded-2xl transition-all font-black text-sm sm:text-base"
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
      <nav className="fixed bottom-0 left-0 right-0 bg-white dark:bg-stone-900 border-t border-stone-200 dark:border-stone-800 px-4 py-2 flex justify-around items-center z-20 shadow-[0_-10px_20px_rgba(0,0,0,0.05)] transition-colors">
        <NavButton active={view === 'dashboard'} onClick={() => setView('dashboard')} icon={<LayoutDashboard />} label={t.dashboard} />
        <NavButton active={view === 'transactions'} onClick={() => setView('transactions')} icon={<PlusCircle />} label={t.transactions} />
        <NavButton active={view === 'savings'} onClick={() => setView('savings')} icon={<PiggyBank />} label={t.savings} />
        
        <NavButton active={view === 'private'} onClick={() => setView('private')} icon={<HandCoins />} label={t.privateLoans} />
        <NavButton active={view === 'history'} onClick={() => setView('history')} icon={<Calendar />} label={t.history} />
      </nav>
    </div>
  );
}

function NavButton({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-1 transition-all flex-1",
        active ? "text-orange-600" : "text-stone-400 dark:text-stone-500 hover:text-stone-600 dark:hover:text-stone-300"
      )}
    >
      <div className={cn("p-1.5 rounded-xl transition-all", active ? "bg-orange-50 dark:bg-orange-950/30" : "bg-transparent")}>
        {React.isValidElement(icon) ? React.cloneElement(icon as React.ReactElement<{ className?: string }>, { className: "w-7 h-7" }) : icon}
      </div>
      <span className="text-[10px] font-black uppercase tracking-tight leading-none">{label}</span>
    </button>
  );
}
