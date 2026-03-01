// Version: 1.0.2 - Force sync and visible update badge
import React, { useState, useEffect, useMemo } from 'react';
import { 
  Plus, 
  Users, 
  Calendar, 
  ChevronRight, 
  Trash2, 
  ArrowLeft, 
  Calculator, 
  ClipboardList,
  ChevronDown,
  ChevronUp,
  UserPlus,
  DollarSign,
  Info,
  Settings,
  Pencil,
  History,
  TrendingUp,
  Download
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import html2canvas from 'html2canvas';
import { RosterItem, Period, BonusEntry, View, GroupBonus } from './types';
import { db } from './firebase';
import { 
  collection, 
  addDoc, 
  getDocs, 
  doc, 
  deleteDoc, 
  updateDoc, 
  query, 
  orderBy, 
  getDoc,
  where,
  onSnapshot,
  Timestamp
} from 'firebase/firestore';

export default function App() {
  const [view, setView] = useState<View>('periods');
  const [sourceView, setSourceView] = useState<View>('periods'); // 新增：追蹤來源頁面，修復返回按鈕邏輯
  const [selectedPeriodId, setSelectedPeriodId] = useState<string | null>(null);
  const [roster, setRoster] = useState<RosterItem[]>([]);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [groupBonuses, setGroupBonuses] = useState<GroupBonus[]>([]);
  const [entries, setEntries] = useState<BonusEntry[]>([]);
  const [activePeriod, setActivePeriod] = useState<Period | null>(null);
  const [periodTab, setPeriodTab] = useState<'settlement' | 'details'>('settlement');
  const [historyTab, setHistoryTab] = useState<'single' | 'group'>('single');
  
  // Form States
  const [newRosterName, setNewRosterName] = useState('');
  const [newRosterEligible, setNewRosterEligible] = useState(true);
  const [newPeriodName, setNewPeriodName] = useState('');
  const [newPeriodCode, setNewPeriodCode] = useState('');
  const [newEntry, setNewEntry] = useState({
    vendor: '',
    unit_price: '',
    person_quantities: {} as Record<string, string>
  });
  const [actualBonusInput, setActualBonusInput] = useState('');

  // Group Calculator States
  const [groupCalcTotal, setGroupCalcTotal] = useState('');
  const [groupCalcName, setGroupCalcName] = useState('');
  const [groupCalcPeriod, setGroupCalcPeriod] = useState('');
  const [groupCalcRows, setGroupCalcRows] = useState<{ person_id: string; sales: string }[]>([
    { person_id: '', sales: '' },
    { person_id: '', sales: '' }
  ]);
  const [groupCalcResult, setGroupCalcResult] = useState<GroupBonus['details'] | null>(null);

  // UI States
  const [isAddingRoster, setIsAddingRoster] = useState(false);
  const [isAddingPeriod, setIsAddingPeriod] = useState(false);
  const [isAddingEntry, setIsAddingEntry] = useState(false);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [expandedVendor, setExpandedVendor] = useState<string | null>(null);
  const [isConfigMissing, setIsConfigMissing] = useState(false);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const reportRef = React.useRef<HTMLDivElement>(null);
  const groupReportRef = React.useRef<HTMLDivElement>(null); // 新增：團體獎金報表 Ref
  const [activeGroupBonus, setActiveGroupBonus] = useState<GroupBonus | null>(null); // 新增：當前選中的團體獎金（用於報表產生）

  useEffect(() => {
    // Check if Firebase config is provided
    if (!import.meta.env.VITE_FIREBASE_PROJECT_ID) {
      setIsConfigMissing(true);
      return;
    }

    // Real-time listeners
    const qRoster = query(collection(db, 'roster'), orderBy('name', 'asc'));
    const unsubscribeRoster = onSnapshot(qRoster, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      setRoster(data);
    });

    const qPeriods = query(collection(db, 'periods'), orderBy('created_at', 'desc'));
    const unsubscribePeriods = onSnapshot(qPeriods, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ 
        id: doc.id, 
        ...doc.data(),
        created_at: doc.data().created_at?.toDate()?.toISOString() || new Date().toISOString()
      } as any));
      setPeriods(data);
    });

    const qGroupBonuses = query(collection(db, 'group_bonuses'), orderBy('created_at', 'desc'));
    const unsubscribeGroupBonuses = onSnapshot(qGroupBonuses, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ 
        id: doc.id, 
        ...doc.data(),
        created_at: doc.data().created_at?.toDate()?.toISOString() || new Date().toISOString()
      } as any));
      setGroupBonuses(data);
    });

    return () => {
      unsubscribeRoster();
      unsubscribePeriods();
      unsubscribeGroupBonuses();
    };
  }, []);

  useEffect(() => {
    if (selectedPeriodId) {
      // Period details listener
      const unsubscribePeriod = onSnapshot(doc(db, 'periods', selectedPeriodId), (docSnap) => {
        if (docSnap.exists()) {
          const data = { id: docSnap.id, ...docSnap.data() } as any;
          setActivePeriod(data);
          setActualBonusInput(data.actual_total_bonus?.toString() || '0');
        }
      });

      const qEntries = query(collection(db, 'bonus_entries'), where('period_id', '==', selectedPeriodId));
      const unsubscribeEntries = onSnapshot(qEntries, (snapshot) => {
        const data = snapshot.docs.map(docSnap => {
          const entryData = docSnap.data();
          const person = roster.find(r => r.id.toString() === entryData.person_id.toString());
          return { 
            id: docSnap.id, 
            ...entryData,
            person_name: person ? person.name : (entryData.person_name || '未知人員')
          } as any;
        });
        setEntries(data);
      });

      return () => {
        unsubscribePeriod();
        unsubscribeEntries();
      };
    }
  }, [selectedPeriodId, roster]);

  const handleAddRoster = async () => {
    if (!newRosterName) return;
    await addDoc(collection(db, 'roster'), {
      name: newRosterName,
      is_eligible_default: newRosterEligible ? 1 : 0
    });
    setNewRosterName('');
    setIsAddingRoster(false);
  };

  const handleDeleteRoster = async (id: string) => {
    if (!confirm('確定要刪除此人員嗎？')) return;
    await deleteDoc(doc(db, 'roster', id));
  };

  const handleAddPeriod = async () => {
    if (!newPeriodName || !newPeriodCode) {
      alert("請輸入檔期與名稱");
      return;
    }
    const docRef = await addDoc(collection(db, 'periods'), {
      name: newPeriodName.trim(),
      period_code: newPeriodCode.trim(),
      actual_total_bonus: 0,
      created_at: Timestamp.now()
    });
    setNewPeriodName('');
    setNewPeriodCode('');
    setIsAddingPeriod(false);
    handleViewPeriod(docRef.id);
  };

  const handleDeletePeriod = async (id: string) => {
    if (!id) {
      alert("錯誤：無效的 ID");
      return;
    }
    if (!window.confirm('確定要刪除此檔期嗎？')) return;
    try {
      // Delete entries first
      const q = query(collection(db, 'bonus_entries'), where('period_id', '==', id));
      const snapshot = await getDocs(q);
      const deletePromises = snapshot.docs.map(d => deleteDoc(doc(db, 'bonus_entries', d.id)));
      await Promise.all(deletePromises);
      await deleteDoc(doc(db, 'periods', id));
      
      alert("刪除成功！");
      
      // If we are in detail view, go back to history or periods
      if (view === 'period_detail') {
        setView('periods');
      }
    } catch (error) {
      console.error("Error deleting period:", error);
      alert("刪除失敗：" + (error instanceof Error ? error.message : String(error)));
    }
  };

  const handleViewPeriod = (id: string, fromView: View = view) => {
    setSourceView(fromView); // 記錄來源頁面
    setSelectedPeriodId(id);
    setView('period_detail');
    setPeriodTab('settlement');
  };

  const handleAddEntry = async () => {
    try {
      if (!selectedPeriodId) {
        alert("找不到目前的檔期資訊，請重新整理頁面。");
        return;
      }
      if (!newEntry.vendor.trim()) {
        alert("請輸入廠商名稱");
        return;
      }
      if (!newEntry.unit_price || parseFloat(newEntry.unit_price) <= 0) {
        alert("請輸入有效的獎金單價");
        return;
      }
      
      const unitPrice = parseFloat(newEntry.unit_price);

      if (editingEntryId) {
        // In edit mode, we find the person ID that was being edited
        const personId = Object.keys(newEntry.person_quantities)[0];
        if (!personId) {
          alert("找不到人員資訊");
          return;
        }
        
        const qtyStr = newEntry.person_quantities[personId];
        const qty = parseInt(qtyStr) || 0;
        
        if (qty <= 0) {
          alert("請輸入有效的數量");
          return;
        }

        const person = roster.find(r => r.id === personId);
        
        const entryData = {
          period_id: selectedPeriodId,
          person_id: personId,
          person_name: person?.name || '未知',
          vendor: newEntry.vendor,
          unit_price: unitPrice,
          quantity: qty,
          is_eligible: person ? person.is_eligible_default : 1
        };
        
        await updateDoc(doc(db, 'bonus_entries', editingEntryId), entryData);
      } else {
        // Adding multiple entries
        const entriesToSave = Object.entries(newEntry.person_quantities)
          .filter(([_, qtyStr]) => qtyStr !== '' && parseInt(qtyStr as string) > 0);
        
        if (entriesToSave.length === 0) {
          alert("請至少輸入一位人員的銷售數量（需大於 0）");
          return;
        }

        const batchPromises = entriesToSave.map(([personId, qtyStr]) => {
          const person = roster.find(r => r.id === personId);
          return addDoc(collection(db, 'bonus_entries'), {
            period_id: selectedPeriodId,
            person_id: personId,
            person_name: person?.name || '未知',
            vendor: newEntry.vendor,
            unit_price: unitPrice,
            quantity: parseInt(qtyStr as string),
            is_eligible: person ? person.is_eligible_default : 1
          });
        });
        
        await Promise.all(batchPromises);
      }

      setNewEntry({ vendor: '', unit_price: '', person_quantities: {} });
      setIsAddingEntry(false);
      setEditingEntryId(null);
    } catch (error) {
      console.error("Error saving entry:", error);
      alert("儲存失敗，請檢查網路連線或稍後再試。錯誤訊息：" + (error instanceof Error ? error.message : String(error)));
    }
  };

  const handleEditEntry = (entry: BonusEntry) => {
    setNewEntry({
      vendor: entry.vendor,
      unit_price: entry.unit_price.toString(),
      person_quantities: { [entry.person_id]: entry.quantity.toString() }
    });
    setEditingEntryId(entry.id);
    setIsAddingEntry(true);
  };

  const handleDeleteEntry = async (id: string) => {
    if (!confirm('確定要刪除此筆登記嗎？')) return;
    await deleteDoc(doc(db, 'bonus_entries', id));
  };

  const handleUpdateActualBonus = async () => {
    if (!selectedPeriodId) return;
    await updateDoc(doc(db, 'periods', selectedPeriodId), {
      actual_total_bonus: parseFloat(actualBonusInput) || 0
    });
  };

  const handleCalculateGroup = () => {
    const total = parseFloat(groupCalcTotal);
    if (isNaN(total) || total <= 0) {
      alert("請輸入有效的總獎金金額");
      return;
    }

    const validRows = groupCalcRows.filter(row => row.person_id && parseFloat(row.sales) > 0);
    if (validRows.length === 0) {
      alert("請至少輸入一位人員的銷售業績");
      return;
    }

    const totalSales = validRows.reduce((sum, row) => sum + parseFloat(row.sales), 0);
    
    const results = validRows.map(row => {
      const person = roster.find(r => r.id === row.person_id);
      const sales = parseFloat(row.sales);
      const share = sales / totalSales;
      const amount = Math.round(total * share);
      return {
        person_id: row.person_id,
        person_name: person?.name || '未知',
        sales,
        share,
        amount
      };
    });

    setGroupCalcResult(results);
  };

  const handleSaveGroupBonus = async () => {
    if (!groupCalcResult || !groupCalcName || !groupCalcPeriod) {
      alert("請輸入檔期、名稱並完成計算");
      return;
    }

    try {
      await addDoc(collection(db, 'group_bonuses'), {
        name: groupCalcName.trim(),
        period_code: groupCalcPeriod.trim(),
        total_amount: parseFloat(groupCalcTotal),
        created_at: Timestamp.now(),
        details: groupCalcResult
      });
      alert("團體獎金已存檔");
      setGroupCalcName('');
      setGroupCalcPeriod('');
      setGroupCalcTotal('');
      setGroupCalcRows([{ person_id: '', sales: '' }, { person_id: '', sales: '' }]);
      setGroupCalcResult(null);
      setView('history');
      setHistoryTab('group');
    } catch (error) {
      console.error("Error saving group bonus:", error);
      alert("存檔失敗");
    }
  };

  const [tempPeriodCode, setTempPeriodCode] = useState('');

  const handleUpdatePaymentDate = async (type: 'single' | 'group', id: string, date: string) => {
    const collectionName = type === 'single' ? 'periods' : 'group_bonuses';
    await updateDoc(doc(db, collectionName, id), {
      payment_date: date
    });
  };

  const handleStartEditName = (type: 'single' | 'group', id: string, currentName: string, currentCode: string) => {
    setEditingNameType(type);
    setEditingNameId(id);
    setTempName(currentName);
    setTempPeriodCode(currentCode);
    setIsEditingName(true);
  };

  const handleSaveName = async () => {
    if (!editingNameId || !tempName.trim()) return;
    const collectionName = editingNameType === 'single' ? 'periods' : 'group_bonuses';
    await updateDoc(doc(db, collectionName, editingNameId), {
      name: tempName.trim(),
      period_code: tempPeriodCode.trim()
    });
    setIsEditingName(false);
    setEditingNameId(null);
  };

  const handleDeleteGroupBonus = async (id: string) => {
    if (!id) {
      alert("錯誤：無效的 ID");
      return;
    }
    if (!window.confirm('確定要刪除此筆團體獎金紀錄嗎？')) return;
    try {
      await deleteDoc(doc(db, 'group_bonuses', id));
      alert("刪除成功！");
    } catch (error) {
      console.error("Error deleting group bonus:", error);
      alert("刪除失敗：" + (error instanceof Error ? error.message : String(error)));
    }
  };

  // Calculations
  const calculations = useMemo(() => {
    const totalRegistered = entries.reduce((sum, e) => sum + (e.unit_price * e.quantity), 0);
    const actualTotal = activePeriod?.actual_total_bonus || 0;
    // 誤差平準機制：實際總額 - 預計總額 = 差額
    const difference = actualTotal > 0 ? actualTotal - totalRegistered : 0;

    const personMap = new Map<string, { 
      name: string, 
      registered: number, 
      isEligible: boolean, 
      entries: BonusEntry[] 
    }>();

    entries.forEach(e => {
      const pId = e.person_id.toString();
      if (!personMap.has(pId)) {
        personMap.set(pId, { 
          name: e.person_name, 
          registered: 0, 
          isEligible: e.is_eligible === 1, 
          entries: [] 
        });
      }
      const p = personMap.get(pId)!;
      p.registered += (e.unit_price * e.quantity);
      p.entries.push(e);
      p.isEligible = e.is_eligible === 1; 
    });

    const eligiblePeopleCount = Array.from(personMap.values()).filter(p => p.isEligible).length;
    // 平分邏輯：差額 / 參與人數
    const levelingPerPerson = eligiblePeopleCount > 0 ? difference / eligiblePeopleCount : 0;

    const settlement = Array.from(personMap.entries()).map(([id, p]) => ({
      id,
      name: p.name,
      registered: p.registered,
      surplus: p.isEligible ? levelingPerPerson : 0,
      total: p.registered + (p.isEligible ? levelingPerPerson : 0),
      isEligible: p.isEligible,
      entries: p.entries
    }));

    // Group by Vendor for Details view
    const vendorMap = new Map<string, { registered: number, entries: BonusEntry[] }>();
    entries.forEach(e => {
      if (!vendorMap.has(e.vendor)) {
        vendorMap.set(e.vendor, { registered: 0, entries: [] });
      }
      const v = vendorMap.get(e.vendor)!;
      v.registered += (e.unit_price * e.quantity);
      v.entries.push(e);
    });

    const vendorDetails = Array.from(vendorMap.entries()).map(([name, v]) => ({
      name,
      registered: v.registered,
      entries: v.entries
    }));

    return { totalRegistered, actualTotal, difference, settlement, vendorDetails };
  }, [entries, activePeriod]);

  const [selectedHistoryPeriodCode, setSelectedHistoryPeriodCode] = useState<string | null>(null);
  const [historyEntries, setHistoryEntries] = useState<BonusEntry[]>([]);
  const [historyDetailTab, setHistoryDetailTab] = useState<'single' | 'group' | 'items'>('single');
  const [isEditingName, setIsEditingName] = useState(false);
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [editingNameType, setEditingNameType] = useState<'single' | 'group'>('single');
  const [tempName, setTempName] = useState('');
  const [isEditingGroupName, setIsEditingGroupName] = useState(false);
  const [editingGroupName, setEditingGroupName] = useState<string | null>(null);
  const [tempGroupName, setTempGroupName] = useState('');

  useEffect(() => {
    if (view === 'history_period_detail' && selectedHistoryPeriodCode) {
      const periodIds = periods
        .filter(p => p.period_code === selectedHistoryPeriodCode)
        .map(p => p.id);
      
      if (periodIds.length === 0) {
        setHistoryEntries([]);
        return;
      }

      const q = query(collection(db, 'bonus_entries'), where('period_id', 'in', periodIds.slice(0, 30)));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const data = snapshot.docs.map(docSnap => {
          const entryData = docSnap.data();
          const person = roster.find(r => r.id.toString() === entryData.person_id.toString());
          return { 
            id: docSnap.id, 
            ...entryData,
            person_name: person ? person.name : (entryData.person_name || '未知人員')
          } as any;
        });
        setHistoryEntries(data);
      });
      return () => unsubscribe();
    }
  }, [view, selectedHistoryPeriodCode, periods, roster]);

  const historyPeriodSummary = useMemo(() => {
    if (!selectedHistoryPeriodCode) return [];
    
    const summary: Record<string, { name: string, single: number, group: number, total: number }> = {};
    
    roster.forEach(r => {
      summary[r.id] = { name: r.name, single: 0, group: 0, total: 0 };
    });

    // 1. 將單品登記按 period_id 分組，以便計算每個項目的誤差平準
    const entriesByPeriod: Record<string, BonusEntry[]> = {};
    historyEntries.forEach(e => {
      if (!entriesByPeriod[e.period_id]) entriesByPeriod[e.period_id] = [];
      entriesByPeriod[e.period_id].push(e);
    });

    // 2. 計算每個單品項目的平準獎金並累加
    Object.entries(entriesByPeriod).forEach(([periodId, periodEntries]) => {
      const periodDoc = periods.find(p => p.id === periodId);
      if (!periodDoc) return;

      const totalRegistered = periodEntries.reduce((sum, e) => sum + (e.unit_price * e.quantity), 0);
      const actualTotal = periodDoc.actual_total_bonus || 0;
      const difference = actualTotal > 0 ? actualTotal - totalRegistered : 0;

      const eligiblePeople = new Set(periodEntries.filter(e => e.is_eligible === 1).map(e => e.person_id));
      const levelingPerPerson = eligiblePeople.size > 0 ? difference / eligiblePeople.size : 0;

      // 累加基礎獎金
      periodEntries.forEach(e => {
        if (summary[e.person_id]) {
          summary[e.person_id].single += (e.unit_price * e.quantity);
        }
      });

      // 累加平準獎金
      eligiblePeople.forEach(pId => {
        if (summary[pId]) {
          summary[pId].single += levelingPerPerson;
        }
      });
    });

    const relevantGroupBonuses = groupBonuses.filter(b => b.period_code === selectedHistoryPeriodCode);
    relevantGroupBonuses.forEach(b => {
      b.details.forEach(d => {
        if (summary[d.person_id]) {
          summary[d.person_id].group += d.amount;
        }
      });
    });

    return Object.entries(summary)
      .map(([id, s]) => ({ ...s, id, total: s.single + s.group }))
      .filter(s => s.total > 0)
      .sort((a, b) => b.total - a.total);
  }, [selectedHistoryPeriodCode, historyEntries, groupBonuses, roster, periods]);

  const handleUpdateGroupPaymentDate = async (code: string, date: string) => {
    const group = groupedHistory.find(([c]) => c === code);
    if (!group) return;
    const [_, data] = group;
    const batchPromises: Promise<any>[] = [];
    data.single.forEach(p => batchPromises.push(updateDoc(doc(db, 'periods', p.id), { payment_date: date })));
    data.group.forEach(b => batchPromises.push(updateDoc(doc(db, 'group_bonuses', b.id), { payment_date: date })));
    await Promise.all(batchPromises);
  };

  const handleRenameGroup = async (oldCode: string, newCode: string) => {
    if (oldCode === newCode) return;
    const group = groupedHistory.find(([c]) => c === oldCode);
    if (!group) return;
    const [_, data] = group;
    const batchPromises: Promise<any>[] = [];
    data.single.forEach(p => batchPromises.push(updateDoc(doc(db, 'periods', p.id), { period_code: newCode })));
    data.group.forEach(b => batchPromises.push(updateDoc(doc(db, 'group_bonuses', b.id), { period_code: newCode })));
    await Promise.all(batchPromises);
  };

  const handleStartEditGroupName = (code: string) => {
    setEditingGroupName(code);
    setTempGroupName(code);
    setIsEditingGroupName(true);
  };

  const handleSaveGroupName = async () => {
    if (!editingGroupName || !tempGroupName.trim()) return;
    await handleRenameGroup(editingGroupName, tempGroupName.trim());
    setIsEditingGroupName(false);
    setEditingGroupName(null);
  };

  const groupedHistory = useMemo(() => {
    const groups: Record<string, { single: Period[], group: GroupBonus[], total: number, payment_date?: string }> = {};
    
    periods.forEach(p => {
      const code = (p.period_code || '未分類').trim();
      if (!groups[code]) groups[code] = { single: [], group: [], total: 0, payment_date: p.payment_date };
      groups[code].single.push(p);
      groups[code].total += (p.actual_total_bonus || 0);
      if (!groups[code].payment_date && p.payment_date) groups[code].payment_date = p.payment_date;
    });
    
    groupBonuses.forEach(b => {
      const code = (b.period_code || '未分類').trim();
      if (!groups[code]) groups[code] = { single: [], group: [], total: 0, payment_date: b.payment_date };
      groups[code].group.push(b);
      groups[code].total += (b.total_amount || 0);
      if (!groups[code].payment_date && b.payment_date) groups[code].payment_date = b.payment_date;
    });
    
    return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));
  }, [periods, groupBonuses]);

  const handleQuantityChange = (personId: string, qty: string) => {
    setNewEntry(prev => ({
      ...prev,
      person_quantities: {
        ...prev.person_quantities,
        [personId]: qty
      }
    }));
  };

  const handleDownloadReport = async () => {
    if (!reportRef.current) return;
    setIsGeneratingReport(true);
    try {
      // Wait for a bit to ensure rendering
      await new Promise(resolve => setTimeout(resolve, 500));
      const canvas = await html2canvas(reportRef.current, {
        scale: 2,
        backgroundColor: '#f8f9fa',
        logging: false,
        useCORS: true
      });
      const link = document.createElement('a');
      link.download = `${activePeriod?.name || '獎金報表'}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (error) {
      console.error('Report generation failed:', error);
      alert('報表產生失敗，請稍後再試。');
    } finally {
      setIsGeneratingReport(false);
    }
  };

  const handleDownloadGroupReport = async (bonus: GroupBonus) => {
    // 修復：實作團體獎金報表下載功能
    setActiveGroupBonus(bonus);
    setIsGeneratingReport(true);
    try {
      // 等待 React 渲染隱藏的模板
      await new Promise(resolve => setTimeout(resolve, 600));
      if (!groupReportRef.current) throw new Error("找不到報表模板");
      
      const canvas = await html2canvas(groupReportRef.current, {
        scale: 2,
        backgroundColor: '#f8f9fa',
        logging: false,
        useCORS: true
      });
      const link = document.createElement('a');
      link.download = `${bonus.name || '團體獎金報表'}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (error) {
      console.error('Group report generation failed:', error);
      alert('團體報表產生失敗，請稍後再試。');
    } finally {
      setIsGeneratingReport(false);
      setActiveGroupBonus(null);
    }
  };

  const uniqueVendors = useMemo(() => {
    const vendors = new Set<string>();
    periods.forEach(p => {
      // This would ideally come from a global entries list, 
      // but we can at least use current entries or a separate collection
    });
    // For now, get from current entries across all periods if available
    entries.forEach(e => vendors.add(e.vendor));
    return Array.from(vendors);
  }, [entries]);

  if (isConfigMissing) {
    return (
      <div className="max-w-md mx-auto min-h-screen flex flex-col items-center justify-center p-10 text-center">
        <Settings size={64} className="text-jp-muted mb-6 animate-spin-slow" />
        <h2 className="text-2xl font-display font-bold mb-4">需要 Firebase 設定</h2>
        <p className="text-jp-muted mb-8">請在環境變數中設定 Firebase API 金鑰與專案 ID 以開始使用資料庫功能。</p>
        <div className="bg-jp-border/20 p-4 rounded-xl text-left text-xs font-mono w-full">
          <p>VITE_FIREBASE_API_KEY=...</p>
          <p>VITE_FIREBASE_PROJECT_ID=...</p>
          <p>...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto min-h-screen flex flex-col pb-20">
      {/* Header */}
      <header className="p-6 pt-10 flex items-center justify-between">
        {view === 'period_detail' || view === 'history_period_detail' ? (
          <button 
            onClick={() => {
              // 修復：改進返回按鈕邏輯，確保返回正確的頁面
              if (view === 'period_detail') {
                setView(sourceView);
              } else {
                setView('history');
              }
            }} 
            className="p-2 -ml-2 text-jp-ink"
          >
            <ArrowLeft size={24} />
          </button>
        ) : (
          <h1 className="text-2xl font-display font-bold text-jp-ink">
            {view === 'periods' ? '單品獎金' : 
             view === 'roster' ? '名冊管理' : 
             view === 'group_calculator' ? '團體激勵案計算器' : '歷史紀錄'}
          </h1>
        )}
        
        {view === 'periods' && (
          <button 
            onClick={() => setIsAddingPeriod(true)}
            className="w-10 h-10 rounded-full bg-jp-accent text-white flex items-center justify-center shadow-sm"
          >
            <Plus size={24} />
          </button>
        )}
        {view === 'roster' && (
          <button 
            onClick={() => setIsAddingRoster(true)}
            className="w-10 h-10 rounded-full bg-jp-accent text-white flex items-center justify-center shadow-sm"
          >
            <UserPlus size={20} />
          </button>
        )}
      </header>

      {/* Main Content */}
      <main className="flex-1 px-6">
        <AnimatePresence mode="wait">
          {view === 'periods' && (
            <motion.div 
              key="periods"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              <div className="bg-jp-accent/5 p-6 rounded-3xl border border-jp-accent/10">
                <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                  <Plus size={20} className="text-jp-accent" /> 建立新單品獎金檔期
                </h2>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <input 
                      type="text" 
                      value={newPeriodCode}
                      onChange={(e) => setNewPeriodCode(e.target.value)}
                      className="w-full p-4 bg-white rounded-2xl outline-none focus:ring-2 ring-jp-accent/20 border border-jp-border/50"
                      placeholder="檔期 (如 2026_02)"
                    />
                    <input 
                      type="text" 
                      value={newPeriodName}
                      onChange={(e) => setNewPeriodName(e.target.value)}
                      className="w-full p-4 bg-white rounded-2xl outline-none focus:ring-2 ring-jp-accent/20 border border-jp-border/50"
                      placeholder="名稱 (如 三月獎金)"
                    />
                  </div>
                  <button 
                    onClick={handleAddPeriod}
                    className="w-full py-4 bg-jp-accent text-white rounded-2xl font-bold shadow-lg shadow-jp-accent/20 active:scale-[0.98] transition-transform"
                  >
                    建立並開始登記
                  </button>
                </div>
              </div>

              <div className="pt-4">
                <h2 className="text-sm font-bold text-jp-muted uppercase tracking-widest mb-4">最近檔期</h2>
                <div className="space-y-3">
                  {periods.slice(0, 3).map(p => (
                    <div 
                      key={`recent-${p.id}`}
                      onClick={() => handleViewPeriod(p.id)}
                      className="glass-card p-5 rounded-2xl flex items-center justify-between cursor-pointer active:scale-[0.98] transition-transform"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium">{p.name}</h3>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              handleStartEditName('single', p.id, p.name, p.period_code);
                            }}
                            className="p-1 text-jp-muted hover:text-jp-accent transition-colors"
                          >
                            <Pencil size={12} />
                          </button>
                        </div>
                        <p className="text-[10px] text-jp-muted mt-1">
                          {new Date(p.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <ChevronRight size={18} className="text-jp-border" />
                    </div>
                  ))}
                  <button 
                    onClick={() => { setView('history'); setHistoryTab('single'); }}
                    className="w-full py-3 text-jp-accent text-sm font-bold flex items-center justify-center gap-1"
                  >
                    查看全部歷史紀錄 <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {view === 'group_calculator' && (
            <motion.div 
              key="group_calculator"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              <div className="glass-card p-6 rounded-3xl">
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                    <label className="text-xs font-bold text-jp-muted uppercase mb-2 block">檔期 (如 2026_02)</label>
                    <input 
                      type="text" 
                      value={groupCalcPeriod}
                      onChange={(e) => setGroupCalcPeriod(e.target.value)}
                      className="w-full p-4 bg-jp-bg rounded-2xl outline-none focus:ring-2 ring-jp-accent/20"
                      placeholder="例如：2026_02"
                    />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-jp-muted uppercase mb-2 block">名稱</label>
                      <input 
                        type="text" 
                        value={groupCalcName}
                        onChange={(e) => setGroupCalcName(e.target.value)}
                        className="w-full p-4 bg-jp-bg rounded-2xl outline-none focus:ring-2 ring-jp-accent/20"
                        placeholder="例如：三月團體"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-jp-muted uppercase mb-2 block">總獎金金額 ($)</label>
                    <input 
                      type="number" 
                      value={groupCalcTotal}
                      onChange={(e) => setGroupCalcTotal(e.target.value)}
                      className="w-full p-4 bg-jp-bg rounded-2xl outline-none focus:ring-2 ring-jp-accent/20"
                      placeholder="例如：100000"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-jp-muted uppercase mb-2 block">人員銷售業績輸入</label>
                    <div className="space-y-3">
                      {groupCalcRows.map((row, idx) => (
                        <div key={idx} className="flex gap-2">
                          <select 
                            value={row.person_id}
                            onChange={(e) => {
                              const newRows = [...groupCalcRows];
                              newRows[idx].person_id = e.target.value;
                              setGroupCalcRows(newRows);
                            }}
                            className="flex-1 p-3 bg-jp-bg rounded-xl text-sm outline-none border border-jp-border/30"
                          >
                            <option value="">選擇姓名</option>
                            {roster.map(r => <option key={`opt-${r.id}`} value={r.id}>{r.name}</option>)}
                          </select>
                          <input 
                            type="number"
                            value={row.sales}
                            onChange={(e) => {
                              const newRows = [...groupCalcRows];
                              newRows[idx].sales = e.target.value;
                              setGroupCalcRows(newRows);
                            }}
                            className="w-24 p-3 bg-jp-bg rounded-xl text-sm outline-none border border-jp-border/30"
                            placeholder="銷售數"
                          />
                          <button 
                            onClick={() => {
                              const newRows = groupCalcRows.filter((_, i) => i !== idx);
                              setGroupCalcRows(newRows);
                            }}
                            className="p-3 text-jp-secondary"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      ))}
                    </div>
                    <button 
                      onClick={() => setGroupCalcRows([...groupCalcRows, { person_id: '', sales: '' }])}
                      className="mt-4 w-full py-3 border-2 border-dashed border-jp-border rounded-2xl text-jp-muted text-sm flex items-center justify-center gap-2"
                    >
                      <Plus size={16} /> 新增人員
                    </button>
                  </div>

                  <button 
                    onClick={handleCalculateGroup}
                    className="w-full py-4 bg-jp-accent text-white rounded-2xl font-bold shadow-lg shadow-jp-accent/20 active:scale-[0.98] transition-transform"
                  >
                    開始分配計算
                  </button>
                </div>
              </div>

              {groupCalcResult && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="glass-card rounded-3xl overflow-hidden"
                >
                  <div className="p-6 bg-jp-accent/5 border-b border-jp-accent/10">
                    <h3 className="font-bold">計算結果</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="bg-jp-bg">
                          <th className="p-4 font-bold text-jp-muted">姓名</th>
                          <th className="p-4 font-bold text-jp-muted text-right">銷售數</th>
                          <th className="p-4 font-bold text-jp-muted text-right">佔比</th>
                          <th className="p-4 font-bold text-jp-muted text-right">應得獎金</th>
                        </tr>
                      </thead>
                      <tbody>
                        {groupCalcResult.map((res, idx) => (
                          <tr key={`calc-res-${res.person_id || idx}`} className="border-b border-jp-border/30">
                            <td className="p-4 font-medium">{res.person_name}</td>
                            <td className="p-4 text-right">{res.sales.toLocaleString()}</td>
                            <td className="p-4 text-right">{(res.share * 100).toFixed(1)}%</td>
                            <td className="p-4 text-right font-bold text-jp-accent">${res.amount.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="p-6">
                    <button 
                      onClick={handleSaveGroupBonus}
                      className="w-full py-4 bg-jp-ink text-white rounded-2xl font-bold active:scale-[0.98] transition-transform"
                    >
                      存檔成團體獎金
                    </button>
                  </div>
                </motion.div>
              )}
            </motion.div>
          )}

          {view === 'history' && (
            <motion.div 
              key="history"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-4"
            >
              {groupedHistory.length === 0 ? (
                <div className="text-center py-20 text-jp-muted">尚無歷史紀錄</div>
              ) : (
                groupedHistory.map(([code, data]) => (
                  <div 
                    key={`history-group-${code}`} 
                    className="glass-card p-6 rounded-3xl space-y-4 border-l-4 border-jp-accent"
                  >
                    <div className="flex items-center justify-between">
                      <div 
                        className="flex items-center gap-4 cursor-pointer flex-1"
                        onClick={() => {
                          setSelectedHistoryPeriodCode(code);
                          setView('history_period_detail');
                        }}
                      >
                        <div className="w-12 h-12 rounded-2xl bg-jp-accent/10 flex items-center justify-center text-jp-accent">
                          <Calendar size={24} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h2 className="text-lg font-bold text-jp-ink">
                              {code.includes('_') ? code.replace('_', '年') : code}檔期
                            </h2>
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                handleStartEditGroupName(code);
                              }}
                              className="p-1 text-jp-muted hover:text-jp-accent transition-colors"
                            >
                              <Pencil size={14} />
                            </button>
                          </div>
                          <p className="text-xs text-jp-muted mt-1">
                            包含 {data.single.length} 個單品項目, {data.group.length} 個團體項目
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-jp-muted mb-1">總獎金</p>
                        <p className="text-lg font-display font-bold text-jp-accent">${data.total.toLocaleString()}</p>
                      </div>
                    </div>
                    
                    <div className="pt-4 border-t border-jp-border/30 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <label className="text-[10px] text-jp-muted font-bold uppercase tracking-widest">獎金入帳日</label>
                        <input 
                          type="date"
                          value={data.payment_date || ''}
                          onChange={(e) => handleUpdateGroupPaymentDate(code, e.target.value)}
                          className="text-xs bg-jp-bg px-3 py-1.5 rounded-lg outline-none focus:ring-1 ring-jp-accent/30 border border-jp-border/30"
                        />
                      </div>
                      <button 
                        onClick={() => {
                          setSelectedHistoryPeriodCode(code);
                          setView('history_period_detail');
                        }}
                        className="text-xs font-bold text-jp-accent flex items-center gap-1"
                      >
                        詳情 <ChevronRight size={14} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </motion.div>
          )}

          {view === 'history_period_detail' && selectedHistoryPeriodCode && (
            <motion.div 
              key="history_period_detail"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-jp-ink">
                  {selectedHistoryPeriodCode.includes('_') ? selectedHistoryPeriodCode.replace('_', '年') : selectedHistoryPeriodCode}檔期 詳情
                </h2>
              </div>

              {/* Tabs for History Detail */}
              <div className="flex p-1 bg-jp-border/30 rounded-xl">
                <button 
                  onClick={() => setHistoryDetailTab('single')}
                  className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${historyDetailTab === 'single' ? 'bg-white shadow-sm text-jp-ink' : 'text-jp-muted'}`}
                >
                  單品結算
                </button>
                <button 
                  onClick={() => setHistoryDetailTab('group')}
                  className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${historyDetailTab === 'group' ? 'bg-white shadow-sm text-jp-ink' : 'text-jp-muted'}`}
                >
                  團體結算
                </button>
                <button 
                  onClick={() => setHistoryDetailTab('items')}
                  className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${historyDetailTab === 'items' ? 'bg-white shadow-sm text-jp-ink' : 'text-jp-muted'}`}
                >
                  項目明細
                </button>
              </div>

              {historyDetailTab === 'single' && (
                <div className="space-y-4">
                  <h3 className="text-sm font-bold text-jp-muted uppercase tracking-widest px-2">人員單品獎金總計</h3>
                  <div className="glass-card rounded-3xl overflow-hidden">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="bg-jp-bg">
                          <th className="p-4 font-bold text-jp-muted">姓名</th>
                          <th className="p-4 font-bold text-jp-muted text-right">單品獎金</th>
                        </tr>
                      </thead>
                      <tbody>
                        {historyPeriodSummary.filter(s => s.single > 0).length === 0 ? (
                          <tr><td colSpan={2} className="p-10 text-center text-jp-muted">此檔期無單品獎金紀錄</td></tr>
                        ) : (
                          historyPeriodSummary.filter(s => s.single > 0).map((s) => (
                            <tr key={`summary-single-${s.id}`} className="border-b border-jp-border/30 last:border-0">
                              <td className="p-4 font-medium">{s.name}</td>
                              <td className="p-4 text-right font-bold text-jp-accent">${s.single.toLocaleString()}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {historyDetailTab === 'group' && (
                <div className="space-y-4">
                  <h3 className="text-sm font-bold text-jp-muted uppercase tracking-widest px-2">人員團體獎金總計</h3>
                  <div className="glass-card rounded-3xl overflow-hidden">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="bg-jp-bg">
                          <th className="p-4 font-bold text-jp-muted">姓名</th>
                          <th className="p-4 font-bold text-jp-muted text-right">團體獎金</th>
                        </tr>
                      </thead>
                      <tbody>
                        {historyPeriodSummary.filter(s => s.group > 0).length === 0 ? (
                          <tr><td colSpan={2} className="p-10 text-center text-jp-muted">此檔期無團體獎金紀錄</td></tr>
                        ) : (
                          historyPeriodSummary.filter(s => s.group > 0).map((s) => (
                            <tr key={`summary-group-${s.id}`} className="border-b border-jp-border/30 last:border-0">
                              <td className="p-4 font-medium">{s.name}</td>
                              <td className="p-4 text-right font-bold text-jp-accent">${s.group.toLocaleString()}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {historyDetailTab === 'items' && (
                <div className="space-y-6">
                  <h3 className="text-sm font-bold text-jp-muted uppercase tracking-widest px-2">獎金項目明細</h3>
                  
                  {groupedHistory.find(([code]) => code === selectedHistoryPeriodCode)?.[1].single.length! > 0 && (
                    <div className="space-y-3">
                      <h4 className="text-[10px] font-bold text-jp-muted uppercase px-2">單品獎金項目</h4>
                      {groupedHistory.find(([code]) => code === selectedHistoryPeriodCode)?.[1].single.map(p => (
                        <div key={`period-${p.id}`} className="glass-card p-5 rounded-2xl space-y-4">
                          <div className="flex items-center justify-between">
                            <div className="flex-1 cursor-pointer" onClick={() => handleViewPeriod(p.id)}>
                              <div className="flex items-center gap-2">
                                <h3 className="font-medium">{p.name}</h3>
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleStartEditName('single', p.id, p.name, p.period_code);
                                  }}
                                  className="p-1 text-jp-muted hover:text-jp-accent transition-colors"
                                >
                                  <Pencil size={12} />
                                </button>
                              </div>
                              <p className="text-[10px] text-jp-muted mt-1">{new Date(p.created_at).toLocaleDateString()}</p>
                            </div>
                            <div className="flex items-center gap-3">
                              <p className="font-display font-bold text-jp-accent">${(p.actual_total_bonus || 0).toLocaleString()}</p>
                              <button 
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  console.log("Trash button clicked for single bonus:", p.id);
                                  handleDeletePeriod(p.id);
                                }}
                                className="p-3 text-red-500 hover:bg-red-50 rounded-full transition-all cursor-pointer relative z-20"
                                aria-label="刪除單品獎金"
                              >
                                <Trash2 size={20} className="pointer-events-none" />
                              </button>
                              <ChevronRight size={18} className="text-jp-border" />
                            </div>
                          </div>
                          <div className="pt-3 border-t border-jp-border/30 flex items-center justify-between">
                            <label className="text-[10px] text-jp-muted font-bold">入帳日期</label>
                            <input 
                              type="date"
                              value={p.payment_date || ''}
                              onChange={(e) => handleUpdatePaymentDate('single', p.id, e.target.value)}
                              className="text-xs bg-jp-bg px-2 py-1 rounded outline-none focus:ring-1 ring-jp-accent/30"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {groupedHistory.find(([code]) => code === selectedHistoryPeriodCode)?.[1].group.length! > 0 && (
                    <div className="space-y-3">
                      <h4 className="text-[10px] font-bold text-jp-muted uppercase px-2">團體獎金項目</h4>
                      {groupedHistory.find(([code]) => code === selectedHistoryPeriodCode)?.[1].group.map(b => (
                        <div key={`group-${b.id}`} className="glass-card p-5 rounded-2xl space-y-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className="flex items-center gap-2">
                                <h3 className="font-medium">{b.name}</h3>
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleStartEditName('group', b.id, b.name, b.period_code);
                                  }}
                                  className="p-1 text-jp-muted hover:text-jp-accent transition-colors"
                                >
                                  <Pencil size={12} />
                                </button>
                              </div>
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDownloadGroupReport(b);
                                }}
                                className="p-1.5 text-jp-accent bg-jp-accent/5 rounded-lg hover:bg-jp-accent/10 transition-colors"
                                title="下載報表"
                              >
                                <Download size={14} />
                              </button>
                            </div>
                            <button 
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                console.log("Trash button clicked for group bonus:", b.id);
                                handleDeleteGroupBonus(b.id);
                              }}
                              className="p-3 text-red-500 hover:bg-red-50 rounded-full transition-all cursor-pointer relative z-20"
                              aria-label="刪除團體獎金"
                            >
                              <Trash2 size={20} className="pointer-events-none" />
                            </button>
                          </div>
                          <div className="bg-jp-bg p-3 rounded-xl flex justify-between items-center">
                            <span className="text-xs text-jp-muted">總獎金</span>
                            <span className="font-display font-bold text-jp-accent">${b.total_amount.toLocaleString()}</span>
                          </div>
                          <div className="pt-3 border-t border-jp-border/30 flex items-center justify-between">
                            <label className="text-[10px] text-jp-muted font-bold">入帳日期</label>
                            <input 
                              type="date"
                              value={b.payment_date || ''}
                              onChange={(e) => handleUpdatePaymentDate('group', b.id, e.target.value)}
                              className="text-xs bg-jp-bg px-2 py-1 rounded outline-none focus:ring-1 ring-jp-accent/30"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          )}

          {view === 'roster' && (
            <motion.div 
              key="roster"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-3"
            >
              {roster.length === 0 ? (
                <div className="text-center py-20 text-jp-muted">
                  <Users size={48} className="mx-auto mb-4 opacity-20" />
                  <p>尚無名冊，請先新增人員</p>
                </div>
              ) : (
                roster.map(r => (
                  <div key={`roster-list-${r.id}`} className="glass-card p-4 rounded-xl flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${r.is_eligible_default ? 'bg-jp-accent' : 'bg-jp-secondary'}`} />
                      <div>
                        <p className="font-medium">{r.name}</p>
                        <p className="text-[10px] uppercase tracking-wider text-jp-muted">
                          {r.is_eligible_default ? '預設可平分' : '預設支援'}
                        </p>
                      </div>
                    </div>
                    <button 
                      onClick={() => handleDeleteRoster(r.id.toString())}
                      className="p-2 text-jp-secondary opacity-50 hover:opacity-100"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                ))
              )}
            </motion.div>
          )}

          {view === 'period_detail' && activePeriod && (
            <motion.div 
              key="period_detail"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-display font-bold">{activePeriod.name}</h2>
                  <button 
                    onClick={() => handleStartEditName('single', activePeriod.id, activePeriod.name, activePeriod.period_code)}
                    className="p-1 text-jp-muted hover:text-jp-accent transition-colors"
                  >
                    <Pencil size={14} />
                  </button>
                </div>
                <div className="flex items-center gap-3">
                  <button 
                    onClick={handleDownloadReport}
                    disabled={isGeneratingReport}
                    className="flex items-center gap-1 text-xs font-bold bg-jp-accent text-white px-3 py-1.5 rounded-full shadow-sm active:scale-95 transition-transform disabled:opacity-50"
                  >
                    <Calculator size={14} /> {isGeneratingReport ? '產生中...' : '下載總表'}
                  </button>
                  <button 
                    onClick={() => handleDeletePeriod(activePeriod.id)}
                    className="text-jp-secondary flex items-center gap-1 text-sm"
                  >
                    <Trash2 size={16} /> 刪除
                  </button>
                </div>
              </div>

              {/* Summary Card */}
              <div className="bg-jp-accent/10 p-6 rounded-3xl border border-jp-accent/20">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] text-jp-accent font-bold uppercase tracking-widest block mb-1">預計總額 (登記)</label>
                    <p className="font-display font-bold text-lg text-jp-ink opacity-60">
                      ${calculations.totalRegistered.toLocaleString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <label className="text-[10px] text-jp-accent font-bold uppercase tracking-widest block mb-1">實際到帳總金額</label>
                    <div className="flex items-center justify-end gap-2">
                      <span className="text-jp-accent font-bold">$</span>
                      <input 
                        type="number" 
                        value={actualBonusInput}
                        onChange={(e) => setActualBonusInput(e.target.value)}
                        onBlur={handleUpdateActualBonus}
                        className="bg-transparent border-b border-jp-accent/30 focus:border-jp-accent outline-none font-display font-bold text-xl w-32 text-right"
                      />
                    </div>
                  </div>
                </div>
                
                <div className="mt-4 pt-4 border-t border-jp-accent/10 grid grid-cols-2 gap-4 items-center">
                  <div className="flex flex-col">
                    <span className="text-[10px] text-jp-accent/80 font-bold uppercase">誤差平準總額</span>
                    <span className={`font-display font-bold text-lg ${calculations.difference >= 0 ? 'text-jp-accent' : 'text-red-500'}`}>
                      {calculations.difference >= 0 ? '+' : ''}{calculations.difference.toLocaleString()}
                    </span>
                  </div>
                  <div className="text-right">
                    <label className="text-[10px] text-jp-muted font-bold uppercase tracking-widest block mb-1">獎金入帳日</label>
                    <input 
                      type="date"
                      value={activePeriod.payment_date || ''}
                      onChange={(e) => handleUpdatePaymentDate('single', activePeriod.id, e.target.value)}
                      className="bg-transparent border-b border-jp-border/50 focus:border-jp-accent outline-none text-xs font-bold text-jp-ink text-right w-full py-1"
                    />
                  </div>
                </div>
              </div>

              {/* Tabs */}
              <div className="flex p-1 bg-jp-border/30 rounded-xl">
                <button 
                  onClick={() => setPeriodTab('settlement')}
                  className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${periodTab === 'settlement' ? 'bg-white shadow-sm text-jp-ink' : 'text-jp-muted'}`}
                >
                  分配結算
                </button>
                <button 
                  onClick={() => setPeriodTab('details')}
                  className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${periodTab === 'details' ? 'bg-white shadow-sm text-jp-ink' : 'text-jp-muted'}`}
                >
                  詳細登記
                </button>
              </div>

              {/* Tab Content */}
              <div className="pb-10">
                {periodTab === 'settlement' ? (
                  <div className="space-y-3">
                    {calculations.settlement.length === 0 ? (
                      <div className="text-center py-10 text-jp-muted">
                        <Info size={32} className="mx-auto mb-2 opacity-20" />
                        <p>尚無登記資料</p>
                      </div>
                    ) : (
                      calculations.settlement.map(s => (
                        <div key={`settlement-card-${s.id}`} className="glass-card p-4 rounded-2xl">
                          <div className="flex justify-between items-start mb-2">
                            <div>
                              <h4 className="font-bold flex items-center gap-2">
                                {s.name}
                                {!s.isEligible && (
                                  <span className="text-[9px] bg-jp-secondary/10 text-jp-secondary px-1.5 py-0.5 rounded border border-jp-secondary/20">支援</span>
                                )}
                              </h4>
                            </div>
                            <div className="text-right">
                              <p className="text-xs text-jp-muted">應領總額</p>
                              <p className="font-display font-bold text-jp-accent text-lg">
                                ${s.total.toLocaleString()}
                              </p>
                            </div>
                          </div>
                          <div className="flex justify-between text-[11px] text-jp-muted">
                            <span>登記: ${s.registered.toLocaleString()}</span>
                            {s.isEligible && (
                              <span className={s.surplus >= 0 ? 'text-jp-accent' : 'text-red-500'}>
                                平分: {s.surplus >= 0 ? '+' : ''}${s.surplus.toLocaleString()}
                              </span>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <button 
                      onClick={() => setIsAddingEntry(true)}
                      className="w-full py-3 border-2 border-dashed border-jp-border rounded-2xl text-jp-muted flex items-center justify-center gap-2 active:bg-jp-border/10"
                    >
                      <Plus size={18} /> 新增登記
                    </button>

                    {calculations.vendorDetails.map(vendor => (
                      <div key={`vendor-${vendor.name}`} className="glass-card rounded-2xl overflow-hidden">
                        <button 
                          onClick={() => setExpandedVendor(expandedVendor === vendor.name ? null : vendor.name)}
                          className="w-full p-4 flex items-center justify-between hover:bg-black/[0.02]"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-jp-accent/10 text-jp-accent flex items-center justify-center font-bold text-xs">
                              <ClipboardList size={14} />
                            </div>
                            <div className="text-left">
                              <p className="font-bold">{vendor.name}</p>
                              <p className="text-[10px] text-jp-muted">{vendor.entries.length} 筆明細</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <p className="font-display font-bold text-sm">${vendor.registered.toLocaleString()}</p>
                            {expandedVendor === vendor.name ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                          </div>
                        </button>
                        
                        <AnimatePresence>
                          {expandedVendor === vendor.name && (
                            <motion.div 
                              initial={{ height: 0 }}
                              animate={{ height: 'auto' }}
                              exit={{ height: 0 }}
                              className="overflow-hidden border-t border-jp-border/50 bg-jp-bg/30"
                            >
                              <div className="p-2 space-y-1">
                                {vendor.entries.map(e => (
                                  <div key={`entry-${e.id}`} className="flex items-center justify-between p-3 rounded-lg hover:bg-white/50 group">
                                    <div className="flex-1">
                                      <p className="text-sm font-medium">{e.person_name}</p>
                                      <p className="text-[10px] text-jp-muted">
                                        ${e.unit_price.toLocaleString()} × {e.quantity}
                                      </p>
                                    </div>
                                    <div className="flex items-center gap-1">
                                      <p className="text-sm font-display font-bold mr-2">${(e.unit_price * e.quantity).toLocaleString()}</p>
                                      <button 
                                        onClick={(e_stop) => {
                                          e_stop.stopPropagation();
                                          handleEditEntry(e);
                                        }}
                                        className="p-2 text-jp-accent bg-jp-accent/5 hover:bg-jp-accent/10 rounded-full transition-colors"
                                        title="修改"
                                      >
                                        <Pencil size={14} />
                                      </button>
                                      <button 
                                        onClick={(e_stop) => {
                                          e_stop.stopPropagation();
                                          handleDeleteEntry(e.id);
                                        }}
                                        className="p-2 text-jp-secondary bg-jp-secondary/5 hover:bg-jp-secondary/10 rounded-full transition-colors"
                                        title="刪除"
                                      >
                                        <Trash2 size={14} />
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Hidden Report Template for Capture */}
        <div className="fixed -left-[9999px] top-0">
          <div 
            ref={reportRef}
            className="w-[600px] p-10 bg-[#f8f9fa] font-sans text-[#141414]"
          >
            <div className="border-b-2 border-[#141414] pb-6 mb-8 flex justify-between items-end">
              <div>
                <h1 className="text-3xl font-bold mb-1">{activePeriod?.name}</h1>
                <p className="text-sm opacity-60">獎金結算總表</p>
              </div>
              <div className="text-right">
                <p className="text-xs font-bold uppercase tracking-widest opacity-40">產生日期</p>
                <p className="text-sm font-medium">{new Date().toLocaleDateString()}</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-6 mb-10">
              <div className="bg-white p-4 rounded-2xl border border-jp-border shadow-sm">
                <p className="text-[10px] font-bold uppercase tracking-widest opacity-40 mb-1">實際總獎金</p>
                <p className="text-xl font-bold text-jp-accent">${(activePeriod?.actual_total_bonus || 0).toLocaleString()}</p>
              </div>
              <div className="bg-white p-4 rounded-2xl border border-jp-border shadow-sm">
                <p className="text-[10px] font-bold uppercase tracking-widest opacity-40 mb-1">登記總額</p>
                <p className="text-xl font-bold">${calculations.totalRegistered.toLocaleString()}</p>
              </div>
              <div className="bg-white p-4 rounded-2xl border border-jp-border shadow-sm">
                <p className="text-[10px] font-bold uppercase tracking-widest opacity-40 mb-1">誤差平準</p>
                <p className={`text-xl font-bold ${calculations.difference >= 0 ? 'text-jp-accent' : 'text-red-500'}`}>
                  {calculations.difference >= 0 ? '+' : ''}${calculations.difference.toLocaleString()}
                </p>
              </div>
            </div>

            <div className="bg-white rounded-3xl border border-jp-border shadow-sm overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-jp-bg">
                    <th className="p-4 text-[10px] font-bold uppercase tracking-widest opacity-40">人員姓名</th>
                    <th className="p-4 text-[10px] font-bold uppercase tracking-widest opacity-40 text-right">登記金額</th>
                    <th className="p-4 text-[10px] font-bold uppercase tracking-widest opacity-40 text-right">平分金額</th>
                    <th className="p-4 text-[10px] font-bold uppercase tracking-widest opacity-40 text-right">總計金額</th>
                  </tr>
                </thead>
                <tbody>
                  {calculations.settlement.map((s, idx) => (
                    <tr key={`report-row-${s.id}`} className={idx % 2 === 0 ? 'bg-transparent' : 'bg-jp-bg/30'}>
                      <td className="p-4 font-bold text-sm border-b border-jp-border">{s.name}</td>
                      <td className="p-4 text-right text-sm border-b border-jp-border">${s.registered.toLocaleString()}</td>
                      <td className="p-4 text-right text-sm border-b border-jp-border text-jp-accent">
                        {s.isEligible ? `+$${s.surplus.toLocaleString()}` : '-'}
                      </td>
                      <td className="p-4 text-right font-bold text-jp-accent border-b border-jp-border">
                        ${s.total.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-10 pt-6 border-t border-black/5 text-center">
              <p className="text-[10px] opacity-30 font-medium italic">Generated by Bonus Helper System</p>
            </div>
          </div>

          {/* 新增：團體獎金報表模板 */}
          {activeGroupBonus && (
            <div 
              ref={groupReportRef}
              className="w-[600px] p-10 bg-[#f8f9fa] font-sans text-[#141414]"
            >
              <div className="border-b-2 border-[#141414] pb-6 mb-8 flex justify-between items-end">
                <div>
                  <h1 className="text-3xl font-bold mb-1">{activeGroupBonus.name}</h1>
                  <p className="text-sm opacity-60">團體激勵案分配總表 ({activeGroupBonus.period_code})</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-bold uppercase tracking-widest opacity-40">產生日期</p>
                  <p className="text-sm font-medium">{new Date().toLocaleDateString()}</p>
                </div>
              </div>

              <div className="bg-white p-6 rounded-2xl border border-jp-border shadow-sm mb-10 text-center">
                <p className="text-[10px] font-bold uppercase tracking-widest opacity-40 mb-1">總獎金金額</p>
                <p className="text-4xl font-bold text-jp-accent">${activeGroupBonus.total_amount.toLocaleString()}</p>
              </div>

              <div className="bg-white rounded-3xl border border-jp-border shadow-sm overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-jp-bg">
                      <th className="p-4 text-[10px] font-bold uppercase tracking-widest opacity-40">人員姓名</th>
                      <th className="p-4 text-[10px] font-bold uppercase tracking-widest opacity-40 text-right">銷售業績</th>
                      <th className="p-4 text-[10px] font-bold uppercase tracking-widest opacity-40 text-right">業績佔比</th>
                      <th className="p-4 text-[10px] font-bold uppercase tracking-widest opacity-40 text-right">分配獎金</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeGroupBonus.details.map((d, idx) => (
                      <tr key={idx} className={idx % 2 === 0 ? 'bg-transparent' : 'bg-jp-bg/30'}>
                        <td className="p-4 font-bold text-sm border-b border-jp-border">{d.person_name}</td>
                        <td className="p-4 text-right text-sm border-b border-jp-border">{d.sales.toLocaleString()}</td>
                        <td className="p-4 text-right text-sm border-b border-jp-border">{(d.share * 100).toFixed(1)}%</td>
                        <td className="p-4 text-right font-bold text-jp-accent border-b border-jp-border">
                          ${d.amount.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-10 pt-6 border-t border-black/5 text-center">
                <p className="text-[10px] opacity-30 font-medium italic">Generated by Bonus Helper System</p>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Bottom Nav */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-jp-border safe-bottom z-40">
        <div className="max-w-md mx-auto flex justify-around p-3">
          <button 
            onClick={() => setView('periods')}
            className={`flex flex-col items-center gap-1 transition-colors ${view === 'periods' ? 'text-jp-accent' : 'text-jp-muted'}`}
          >
            <DollarSign size={20} />
            <span className="text-[10px] font-medium">單品獎金</span>
          </button>
          <button 
            onClick={() => setView('group_calculator')}
            className={`flex flex-col items-center gap-1 transition-colors ${view === 'group_calculator' ? 'text-jp-accent' : 'text-jp-muted'}`}
          >
            <Calculator size={20} />
            <span className="text-[10px] font-medium">團體計算</span>
          </button>
          <button 
            onClick={() => {
              setView('history');
              setHistoryTab('single');
              setSelectedHistoryPeriodCode(null);
            }}
            className={`flex flex-col items-center gap-1 transition-colors ${view === 'history' || view === 'history_period_detail' || view === 'period_detail' ? 'text-jp-accent' : 'text-jp-muted'}`}
          >
            <History size={20} />
            <span className="text-[10px] font-medium">歷史紀錄</span>
          </button>
          <button 
            onClick={() => setView('roster')}
            className={`flex flex-col items-center gap-1 transition-colors ${view === 'roster' ? 'text-jp-accent' : 'text-jp-muted'}`}
          >
            <Users size={20} />
            <span className="text-[10px] font-medium">名冊管理</span>
          </button>
        </div>
      </nav>

      {/* Modals */}
      <AnimatePresence>
        {/* Add Roster Modal */}
        {isAddingRoster && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAddingRoster(false)}
              className="absolute inset-0 bg-black/20 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              className="relative w-full max-w-sm bg-white rounded-t-3xl sm:rounded-3xl p-8 shadow-xl"
            >
              <h3 className="text-xl font-display font-bold mb-6">新增人員</h3>
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-jp-muted uppercase mb-2 block">姓名</label>
                  <input 
                    autoFocus
                    type="text" 
                    value={newRosterName}
                    onChange={(e) => setNewRosterName(e.target.value)}
                    className="w-full p-4 bg-jp-bg rounded-2xl outline-none focus:ring-2 ring-jp-accent/20"
                    placeholder="輸入姓名..."
                  />
                </div>
                <div className="flex items-center justify-between p-4 bg-jp-bg rounded-2xl">
                  <span className="text-sm">預設參與平分</span>
                  <button 
                    onClick={() => setNewRosterEligible(!newRosterEligible)}
                    className={`w-12 h-6 rounded-full transition-colors relative ${newRosterEligible ? 'bg-jp-accent' : 'bg-jp-border'}`}
                  >
                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${newRosterEligible ? 'left-7' : 'left-1'}`} />
                  </button>
                </div>
                <button 
                  onClick={handleAddRoster}
                  className="w-full py-4 bg-jp-accent text-white rounded-2xl font-bold shadow-lg shadow-jp-accent/20 active:scale-[0.98] transition-transform"
                >
                  確認新增
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Add Period Modal */}
        {isAddingPeriod && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAddingPeriod(false)}
              className="absolute inset-0 bg-black/20 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              className="relative w-full max-w-sm bg-white rounded-t-3xl sm:rounded-3xl p-8 shadow-xl"
            >
              <h3 className="text-xl font-display font-bold mb-6">建立新單品獎金</h3>
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-jp-muted uppercase mb-2 block">檔期 (如 2026_02)</label>
                  <input 
                    autoFocus
                    type="text" 
                    value={newPeriodCode}
                    onChange={(e) => setNewPeriodCode(e.target.value)}
                    className="w-full p-4 bg-jp-bg rounded-2xl outline-none focus:ring-2 ring-jp-accent/20"
                    placeholder="例如：2026_02"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-jp-muted uppercase mb-2 block">名稱</label>
                  <input 
                    type="text" 
                    value={newPeriodName}
                    onChange={(e) => setNewPeriodName(e.target.value)}
                    className="w-full p-4 bg-jp-bg rounded-2xl outline-none focus:ring-2 ring-jp-accent/20"
                    placeholder="例如：三月獎金"
                  />
                </div>
                <button 
                  onClick={handleAddPeriod}
                  className="w-full py-4 bg-jp-accent text-white rounded-2xl font-bold shadow-lg shadow-jp-accent/20 active:scale-[0.98] transition-transform"
                >
                  建立檔期
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Edit Name Modal */}
      <AnimatePresence>
        {isEditingName && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsEditingName(false)}
              className="absolute inset-0 bg-jp-ink/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, y: 100 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 100 }}
              className="relative w-full max-w-sm bg-white rounded-t-[32px] sm:rounded-[32px] p-8 shadow-2xl"
            >
              <h2 className="text-xl font-bold mb-6 text-jp-ink">修改名稱</h2>
              <div className="space-y-6">
                <div>
                  <label className="text-xs font-bold text-jp-muted uppercase mb-2 block">檔期 (如 2026_02)</label>
                  <input 
                    type="text" 
                    value={tempPeriodCode}
                    onChange={(e) => setTempPeriodCode(e.target.value)}
                    className="w-full p-4 bg-jp-bg rounded-2xl outline-none focus:ring-2 ring-jp-accent/20 border border-jp-border/30 mb-4"
                    placeholder="輸入檔期代碼..."
                  />
                  <label className="text-xs font-bold text-jp-muted uppercase mb-2 block">名稱</label>
                  <input 
                    type="text" 
                    value={tempName}
                    onChange={(e) => setTempName(e.target.value)}
                    className="w-full p-4 bg-jp-bg rounded-2xl outline-none focus:ring-2 ring-jp-accent/20 border border-jp-border/30"
                    placeholder="輸入新名稱..."
                    autoFocus
                  />
                </div>
                <div className="flex gap-3">
                  <button 
                    onClick={() => setIsEditingName(false)}
                    className="flex-1 py-4 bg-jp-bg text-jp-muted rounded-2xl font-bold"
                  >
                    取消
                  </button>
                  <button 
                    onClick={handleSaveName}
                    className="flex-1 py-4 bg-jp-accent text-white rounded-2xl font-bold shadow-lg shadow-jp-accent/20"
                  >
                    儲存修改
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit Group Name Modal */}
      <AnimatePresence>
        {isEditingGroupName && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsEditingGroupName(false)}
              className="absolute inset-0 bg-jp-ink/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, y: 100 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 100 }}
              className="relative w-full max-w-sm bg-white rounded-t-[32px] sm:rounded-[32px] p-8 shadow-2xl"
            >
              <h2 className="text-xl font-bold mb-6 text-jp-ink">修改檔期名稱</h2>
              <div className="space-y-6">
                <div>
                  <label className="text-xs font-bold text-jp-muted uppercase mb-2 block">檔期 (如 2026_02)</label>
                  <input 
                    type="text" 
                    value={tempGroupName}
                    onChange={(e) => setTempGroupName(e.target.value)}
                    className="w-full p-4 bg-jp-bg rounded-2xl outline-none focus:ring-2 ring-jp-accent/20 border border-jp-border/30"
                    placeholder="輸入檔期代碼..."
                    autoFocus
                  />
                </div>
                <div className="flex gap-3">
                  <button 
                    onClick={() => setIsEditingGroupName(false)}
                    className="flex-1 py-4 bg-jp-bg text-jp-muted rounded-2xl font-bold"
                  >
                    取消
                  </button>
                  <button 
                    onClick={handleSaveGroupName}
                    className="flex-1 py-4 bg-jp-accent text-white rounded-2xl font-bold shadow-lg shadow-jp-accent/20"
                  >
                    儲存修改
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
        {isAddingEntry && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setIsAddingEntry(false);
                setEditingEntryId(null);
                setNewEntry({ vendor: '', unit_price: '', person_quantities: {} });
              }}
              className="absolute inset-0 bg-black/20 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              className="relative w-full max-w-sm bg-white rounded-t-3xl sm:rounded-3xl p-8 shadow-xl max-h-[90vh] overflow-y-auto"
            >
              <h3 className="text-xl font-display font-bold mb-6">{editingEntryId ? '修改登記' : '登記獎金'}</h3>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-jp-muted uppercase mb-2 block">廠商名稱</label>
                    <input 
                      type="text" 
                      list="vendor-suggestions"
                      value={newEntry.vendor}
                      onChange={(e) => setNewEntry({ ...newEntry, vendor: e.target.value })}
                      className="w-full p-4 bg-jp-bg rounded-2xl outline-none focus:ring-2 ring-jp-accent/20"
                      placeholder="輸入或選擇..."
                    />
                    <datalist id="vendor-suggestions">
                      {uniqueVendors.map(v => <option key={v} value={v} />)}
                    </datalist>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-jp-muted uppercase mb-2 block">獎金單價</label>
                    <input 
                      type="number" 
                      value={newEntry.unit_price}
                      onChange={(e) => setNewEntry({ ...newEntry, unit_price: e.target.value })}
                      className="w-full p-4 bg-jp-bg rounded-2xl outline-none focus:ring-2 ring-jp-accent/20"
                      placeholder="0"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-jp-muted uppercase mb-2 block">
                    {editingEntryId ? '修改數量' : '人員銷售數量'}
                  </label>
                  <div className="space-y-2 max-h-64 overflow-y-auto p-1 bg-jp-bg/50 rounded-2xl border border-jp-border/30">
                    {roster.length === 0 ? (
                      <div className="py-4 text-center text-xs text-jp-muted">請先至名冊管理新增人員</div>
                    ) : (
                      roster
                        .filter(r => !editingEntryId || newEntry.person_quantities[r.id] !== undefined)
                        .map(r => (
                          <div key={`modal-roster-${r.id}`} className="flex items-center justify-between p-3 bg-white rounded-xl border border-jp-border/50">
                            <span className="text-sm font-medium">{r.name}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-jp-muted">數量:</span>
                              <input 
                                type="number"
                                min="0"
                                value={newEntry.person_quantities[r.id] || ''}
                                onChange={(e) => handleQuantityChange(r.id, e.target.value)}
                                className="w-20 p-2 bg-jp-bg rounded-lg text-right text-sm outline-none focus:ring-1 ring-jp-accent/50"
                                placeholder="0"
                              />
                            </div>
                          </div>
                        ))
                    )}
                  </div>
                </div>

                <button 
                  onClick={handleAddEntry}
                  className="w-full py-4 bg-jp-accent text-white rounded-2xl font-bold shadow-lg shadow-jp-accent/20 active:scale-[0.98] transition-transform"
                >
                  {editingEntryId ? '儲存修改' : '確認登記'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
