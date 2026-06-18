'use client';

import { useState, useEffect } from 'react';
import { Users, Trophy, Settings, LogOut, Clock, KeyRound } from 'lucide-react';
import { getMatches, getLeaderboard, getTopStreaks, getMyPredictions, submitPrediction as submitPredictionAction, registerAction, loginAction, logoutAction, getCurrentUserAction } from '@/lib/actions';
import { toast } from '@/lib/toast';
import { confirm } from '@/lib/confirm';
import { showPopup } from '@/lib/popup';

function enrichPredictions(myPredData: any[]) {
  const chrono = [...myPredData].sort((a: any, b: any) =>
    new Date(a.kickoff_at).getTime() - new Date(b.kickoff_at).getTime()
  );
  let runningStreak = 0;
  const streakMap = new Map<string, number>();
  for (const p of chrono) {
    if (p.status === 'finished' && p.home_score != null && p.away_score != null) {
      if (p.home_pred === p.home_score && p.away_pred === p.away_score) {
        runningStreak += 1;
        streakMap.set(p.match_id, runningStreak);
      } else {
        runningStreak = 0;
        streakMap.set(p.match_id, -1);
      }
    }
  }
  return myPredData.map((p: any) => {
    const home = p.home_name_vi || p.home_name || 'Team';
    const away = p.away_name_vi || p.away_name || 'Team';
    let outcome = 'Chưa diễn ra';
    let points = 0;
    let outcomeColor = 'text-[#787774]';
    let streakDisplay = '';
    if (p.status === 'finished' && p.home_score != null && p.away_score != null) {
      if (p.home_pred === p.home_score && p.away_pred === p.away_score) {
        outcome = 'Đúng tỷ số';
        points = 5;
        outcomeColor = 'text-[#346538]';
        streakDisplay = `${streakMap.get(p.match_id) || '-'}`;
      } else {
        const winner = Math.sign(p.home_score - p.away_score);
        const predWinner = Math.sign(p.home_pred - p.away_pred);
        if (winner === predWinner) {
          outcome = 'Đúng đội thắng';
          points = 2;
          outcomeColor = 'text-[#1F6C9F]';
        } else {
          outcome = 'Sai';
          points = 0;
          outcomeColor = 'text-red-600';
        }
        streakDisplay = '✕';
      }
    }
    return {
      matchId: p.match_id,
      home,
      away,
      pred: `${p.home_pred}-${p.away_pred}`,
      actual: p.status === 'finished' ? `${p.home_score}-${p.away_score}` : '-',
      outcome,
      points,
      outcomeColor,
      streakDisplay,
      editCount: p.edit_count || 0,
      time: new Date(p.submitted_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
    };
  });
}

export default function WC26Predict() {
  const [activeTab, setActiveTab] = useState<'upcoming' | 'finished'>('upcoming');
  const [matches, setMatches] = useState<any[]>([]);
  const [myPredictions, setMyPredictions] = useState<any[]>([]);
  const [showAdmin, setShowAdmin] = useState(false);
  const [showPredictModal, setShowPredictModal] = useState<any | null>(null);
  const [predHome, setPredHome] = useState(0);
  const [predAway, setPredAway] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [realLeaderboard, setRealLeaderboard] = useState<any[]>([]);
  const [realTopStreaks, setRealTopStreaks] = useState<any[]>([]);
  const [now, setNow] = useState(new Date());

  // Format kickoff (stored as UTC) to Vietnam time (Asia/Ho_Chi_Minh) for display.
  // Do NOT manually add 7h to the timestamp; use timeZone option instead.
  const formatVNTime = (kickoffAt: string) => {
    const date = new Date(kickoffAt);
    return date.toLocaleTimeString('vi-VN', { 
      hour: '2-digit', 
      minute: '2-digit', 
      hour12: false,
      timeZone: 'Asia/Ho_Chi_Minh'
    });
  };

  const formatShortVNDate = (kickoffAt: string) => {
    const date = new Date(kickoffAt);
    return date.toLocaleDateString('vi-VN', { 
      month: '2-digit', 
      day: '2-digit',
      timeZone: 'Asia/Ho_Chi_Minh'
    });
  };

  const [currentUser, setCurrentUser] = useState<any>(null);
  const [showLogin, setShowLogin] = useState(false);
  const [showRegister, setShowRegister] = useState(false);
  const [authUsername, setAuthUsername] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [adminUsers, setAdminUsers] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [auditSearch, setAuditSearch] = useState("");
  const [auditActionFilter, setAuditActionFilter] = useState("");
  const [auditFrom, setAuditFrom] = useState("");
  const [auditTo, setAuditTo] = useState("");
  const [auditPage, setAuditPage] = useState(1);
  const auditPageSize = 20;

  const [myPredPage, setMyPredPage] = useState(1);
  const myPredPageSize = 10;

  const [adminUserPage, setAdminUserPage] = useState(1);
  const adminUserPageSize = 20;

  const [showHistory, setShowHistory] = useState(false);
  const [showChangePw, setShowChangePw] = useState(false);
  const [pwCurrent, setPwCurrent] = useState("");
  const [pwNew, setPwNew] = useState("");

  // Client countdown: update every minute for UX (server still enforces 10-min cutoff)
  useEffect(() => {
    const interval = setInterval(() => {
      setNow(new Date());
    }, 60000); // 1 minute
    return () => clearInterval(interval);
  }, []);

  // Load real matches + flags + Vietnamese names + leaderboard + my predictions + current user from DB
  useEffect(() => {
    async function load() {
      try {
        const [matchData, lbData, streakData, myPredData, user] = await Promise.all([
          getMatches(),
          getLeaderboard(10),
          getTopStreaks(5),
          getMyPredictions(),
          getCurrentUserAction()
        ]);
        setMatches(matchData);
        setRealLeaderboard(lbData);
        setRealTopStreaks(streakData);
        setMyPredictions(enrichPredictions(myPredData));
        setCurrentUser(user);
      } catch (e) {
        console.log("Using fallback data");
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, []);

  // Load admin users + audit logs when CMS is opened
  useEffect(() => {
    if (showAdmin && currentUser?.role === 'admin') {
      (async () => {
        try {
          const { getAllUsersAction, getRecentAuditLogs } = await import('@/lib/actions');
          const [users, logs] = await Promise.all([
            getAllUsersAction(),
            getRecentAuditLogs(100)
          ]);
          setAdminUsers(users);
          setAuditLogs(logs);
        } catch (e) {
          console.log("Admin data load failed or not admin");
        }
      })();
    }
  }, [showAdmin, currentUser]);

  const upcomingMatches = matches.filter((m: any) => m.status !== 'finished');
  const finishedMatches = matches.filter((m: any) => m.status === 'finished');

  const todayStr = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
  const todayFinishedMatches = finishedMatches.filter((m: any) => {
    return new Date(m.kickoff_at).toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }) === todayStr;
  });

  // Client-side filter for audit logs
  const filteredAuditLogs = auditLogs.filter((log: any) => {
    const search = auditSearch.toLowerCase();
    const matchesSearch = !search || 
      (log.action && log.action.toLowerCase().includes(search)) ||
      (log.username && log.username.toLowerCase().includes(search)) ||
      (log.details && log.details.toLowerCase().includes(search));
    
    const matchesAction = !auditActionFilter || log.action === auditActionFilter;
    
    let matchesDate = true;
    if (auditFrom) {
      matchesDate = matchesDate && log.created_at >= auditFrom;
    }
    if (auditTo) {
      matchesDate = matchesDate && log.created_at <= auditTo + 'T23:59:59';
    }
    return matchesSearch && matchesAction && matchesDate;
  });

  // Paginated audit logs
  const paginatedAuditLogs = filteredAuditLogs.slice(
    (auditPage - 1) * auditPageSize,
    auditPage * auditPageSize
  );
  const totalAuditPages = Math.max(1, Math.ceil(filteredAuditLogs.length / auditPageSize));

  // Paginated my predictions
  const paginatedMyPreds = myPredictions.slice(
    (myPredPage - 1) * myPredPageSize,
    myPredPage * myPredPageSize
  );
  const totalMyPredPages = Math.max(1, Math.ceil(myPredictions.length / myPredPageSize));

  // Paginated admin users
  const paginatedAdminUsers = adminUsers.slice(
    (adminUserPage - 1) * adminUserPageSize,
    adminUserPage * adminUserPageSize
  );
  const totalAdminUserPages = Math.max(1, Math.ceil(adminUsers.length / adminUserPageSize));

  // Better action color coding
  function getActionColor(action: string) {
    if (action.includes('rejected')) return 'text-red-700 bg-red-100 px-1.5 rounded';
    if (action === 'prediction_submitted') return 'text-emerald-700 bg-emerald-100 px-1.5 rounded';
    if (action === 'prediction_updated') return 'text-teal-700 bg-teal-100 px-1.5 rounded';
    if (action.includes('login_success')) return 'text-green-700 bg-green-100 px-1.5 rounded';
    if (action.includes('login_failed')) return 'text-orange-700 bg-orange-100 px-1.5 rounded';
    if (action.includes('admin')) return 'text-indigo-700 bg-indigo-100 px-1.5 rounded';
    if (action.includes('register')) return 'text-amber-700 bg-amber-100 px-1.5 rounded';
    return 'text-[#787774]';
  }

  // Calculate remaining minutes until prediction closes (10 min before kickoff)
  function getMinutesLeft(kickoffAt: string): number {
    const kickoff = new Date(kickoffAt);
    const cutoff = new Date(kickoff.getTime() - 10 * 60 * 1000);
    return Math.max(0, Math.floor((cutoff.getTime() - now.getTime()) / 60000));
  }

  const openPredict = (match: any) => {
    if (!currentUser) {
      toast("Vui lòng đăng nhập để dự đoán.", 'info');
      setShowLogin(true);
      return;
    }
    const minutesLeft = getMinutesLeft(match.kickoff_at);
    if (!match.can_predict || minutesLeft <= 0) {
      toast("Đã quá hạn dự đoán cho trận này.", 'error');
      return;
    }
    setShowPredictModal(match);
    const existing = myPredictions.find((p: any) => p.matchId === match.id);
    if (existing) {
      const [h, a] = existing.pred.split('-').map((n: string) => parseInt(n) || 0);
      setPredHome(h);
      setPredAway(a);
    } else {
      setPredHome(0);
      setPredAway(0);
    }
  };

  const submitPrediction = async () => {
    if (!showPredictModal) return;

    const homeVi = showPredictModal.home_name_vi || showPredictModal.home_name || showPredictModal.home;
    const awayVi = showPredictModal.away_name_vi || showPredictModal.away_name || showPredictModal.away;

    try {
      await submitPredictionAction(showPredictModal.id, predHome, predAway);

      const isUpdate = myPredictions.some((p: any) => p.matchId === showPredictModal.id);

      setShowPredictModal(null);

      toast(
        `${isUpdate ? 'Đã cập nhật' : 'Đã ghi nhận'} dự đoán ${homeVi} ${predHome}-${predAway} ${awayVi}`,
        'success'
      );

      // Refresh predictions + matches
      const [fresh, freshPreds] = await Promise.all([getMatches(), getMyPredictions()]);
      setMatches(fresh);
      setMyPredictions(enrichPredictions(freshPreds));
    } catch (e: any) {
      toast(e?.message || "Lưu dự đoán thất bại (có thể đã dự đoán hoặc trận đã bắt đầu)", 'error');
    }
  };

  // Simple auth handlers
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    try {
      await loginAction(authUsername, authPassword);
      window.location.reload();
    } catch (err: any) {
      setAuthError(err.message || "Đăng nhập thất bại");
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    try {
      const res = await registerAction(authUsername, authPassword);
      toast(res.message, 'success');
      setShowRegister(false);
      setShowLogin(true);
      setAuthUsername("");
      setAuthPassword("");
    } catch (err: any) {
      setAuthError(err.message || "Đăng ký thất bại");
    }
  };

  return (
    <div className="min-h-screen">
      {/* Top nav - minimalist-ui flat */}
      <nav className="border-b border-[#EAEAEA] bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-[#111] flex items-center justify-center text-white text-sm font-semibold">WC</div>
            <div>
              <div className="font-semibold tracking-tight">WC26 Predict</div>
              <div className="text-[10px] text-[#787774] -mt-1">Nội bộ • 2026</div>
            </div>
          </div>

          <div className="flex items-center gap-4 text-sm">
            {currentUser ? (
              <>
                <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-[#F7F6F3] border border-[#EAEAEA]">
                  <Users className="w-4 h-4" /> {currentUser.username}
                  {currentUser.role === 'admin' && <span className="text-[10px] bg-[#1F6C9F] text-white px-1 rounded">ADMIN</span>}
                </div>
                <button 
                  onClick={() => setShowHistory(true)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded border border-[#EAEAEA] hover:bg-white text-xs font-medium"
                >
                  <Clock className="w-3.5 h-3.5" /> Lịch sử
                </button>
                <button 
                  onClick={() => { setShowChangePw(true); setPwCurrent(""); setPwNew(""); }}
                  className="flex items-center gap-1 px-3 py-1.5 rounded border border-[#EAEAEA] hover:bg-white text-xs font-medium"
                >
                  <KeyRound className="w-3.5 h-3.5" /> Đổi MK
                </button>
                {currentUser.role === 'admin' && (
                  <a href="/admin" className="flex items-center gap-2 px-3 py-1.5 rounded border border-[#EAEAEA] hover:bg-white text-xs font-medium">
                    <Settings className="w-3.5 h-3.5" /> Admin CMS
                  </a>
                )}
                <button 
                  onClick={async () => {
                    await logoutAction();
                    window.location.reload();
                  }}
                  className="text-[#787774] hover:text-[#111] flex items-center gap-1 text-xs"
                >
                  <LogOut className="w-3.5 h-3.5" /> Thoát
                </button>
              </>
            ) : (
              <>
                <button onClick={() => { setShowLogin(true); setAuthError(""); }} className="text-xs px-3 py-1.5 border border-[#EAEAEA] rounded hover:bg-white">Đăng nhập</button>
                <button onClick={() => { setShowRegister(true); setAuthError(""); }} className="text-xs px-3 py-1.5 bg-[#111] text-white rounded">Đăng ký</button>
              </>
            )}
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="mb-10">
          <div className="uppercase tracking-[2px] text-xs text-[#787774] mb-1">World Cup 2026 • Dự đoán nội bộ</div>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-x-8 gap-y-4 items-end">
            {/* Left: Big title - keeps editorial impact */}
            <div className="lg:col-span-7">
              <h1 className="text-5xl font-semibold tracking-[-1.5px] leading-none">Dự đoán tỷ số.<br />Ghi điểm. Tranh ngôi đầu.</h1>
            </div>

            {/* Right: Bento-style rule cards - fills space, visual hierarchy, follows minimalist-ui bento + muted pastels */}
            <div className="lg:col-span-5">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="card p-3 match-card hover:border-[#d1d1d1]">
                  <div className="text-[10px] text-[#787774] tracking-[1px]">ĐÚNG TỶ SỐ</div>
                  <div className="text-3xl font-semibold tabular-nums tracking-[-1px] leading-none mt-1 text-[#346538]">+5</div>
                  <div className="text-xs text-[#787774] mt-0.5">điểm</div>
                </div>
                <div className="card p-3 match-card hover:border-[#d1d1d1]">
                  <div className="text-[10px] text-[#787774] tracking-[1px]">ĐÚNG ĐỘI THẮNG</div>
                  <div className="text-3xl font-semibold tabular-nums tracking-[-1px] leading-none mt-1 text-[#1F6C9F]">+2</div>
                  <div className="text-xs text-[#787774] mt-0.5">điểm</div>
                </div>
                <div className="card p-3 match-card hover:border-[#d1d1d1]">
                  <div className="text-[10px] text-[#787774] tracking-[1px]">STREAK</div>
                  <div className="text-3xl font-semibold tabular-nums tracking-[-1px] leading-none mt-1">+3 / +5 / +8</div>
                  <div className="text-xs text-[#787774] mt-0.5">điểm thưởng</div>
                </div>
              </div>
            </div>

            {/* Subtle tagline under the bento for balance */}
            <div className="lg:col-span-12 text-sm text-[#787774] mt-2 tracking-tight">
              Tham gia ngay • Dự đoán chính xác • Xây dựng streak để dẫn đầu bảng
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* LEADERBOARD + STREAKS */}
          <div className="lg:col-span-5">
            <div className="card p-6 mb-6">
              <div className="flex items-center gap-2 mb-4">
                <Trophy className="w-5 h-5" />
                <div className="font-semibold tracking-tight">Bảng xếp hạng</div>
                <div className="ml-auto text-xs text-[#787774]">Cập nhật {now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</div>
              </div>

              <table className="table w-full text-sm">
                <thead>
                  <tr>
                    <th className="w-8">#</th>
                    <th>Người chơi</th>
                    <th className="text-right">Điểm</th>
                    <th className="text-right w-16">Streak</th>
                  </tr>
                </thead>
                <tbody>
                  {realLeaderboard.map((p: any, i: number) => (
                    <tr key={i} className={i < 3 ? "bg-[#F7F6F3]" : ""}>
                      <td className="font-mono text-[#787774]">{i + 1}</td>
                      <td className="font-medium">{p.name || p.username}</td>
                      <td className="text-right tabular-nums font-semibold">{p.points || p.total_points}</td>
                      <td className="text-right">
                        {(p.streak || p.current_streak) > 0 && (
                          <span className="streak inline-block">🔥 {p.streak || p.current_streak}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {realLeaderboard.length === 0 && (
                    <tr><td colSpan={4} className="text-center py-4 text-[#787774]">Chưa có dữ liệu. Hãy chờ trận đầu tiên kết thúc.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Top 5 Current Streaks */}
            <div className="card p-6">
              <div className="font-semibold tracking-tight mb-4 text-sm">Top 5 streak hiện tại</div>
              <div className="space-y-3">
                {realTopStreaks.map((p: any, idx: number) => (
                  <div key={idx} className="flex items-center justify-between px-3 py-2 rounded border border-[#EAEAEA]">
                    <div className="font-medium">{p.name || p.username}</div>
                    <div className="streak text-base px-3 py-0.5">🔥 {p.streak || p.current_streak}</div>
                  </div>
                ))}
                {realTopStreaks.length === 0 && (
                  <div className="text-sm text-[#787774] py-2">Chưa có ai có streak. Hãy là người đầu tiên!</div>
                )}
              </div>
              <div className="text-[10px] text-[#787774] mt-3">Streak reset ngay nếu sai hoặc bỏ 1 trận đã diễn ra.</div>
            </div>
          </div>

          {/* MATCHES */}
          <div className="lg:col-span-7">
            <div className="flex border-b border-[#EAEAEA] mb-4">
              <button 
                onClick={() => setActiveTab('upcoming')}
                className={`px-5 py-2 text-sm font-medium border-b-2 transition-all ${activeTab === 'upcoming' ? 'border-[#111] text-[#111]' : 'border-transparent text-[#787774] hover:text-[#111]'}`}
              >
                Sắp diễn ra
              </button>
              <button 
                onClick={() => setActiveTab('finished')}
                className={`px-5 py-2 text-sm font-medium border-b-2 transition-all ${activeTab === 'finished' ? 'border-[#111] text-[#111]' : 'border-transparent text-[#787774] hover:text-[#111]'}`}
              >
                Đã diễn ra
              </button>
            </div>

            {activeTab === 'upcoming' && (
              <div className="space-y-4">
                {isLoading && <div className="text-[#787774] py-4">Đang tải...</div>}
                
                {!isLoading && (() => {
                  // Dùng thời gian thực (live `now` state, cập nhật mỗi phút) để tính "VN hôm nay" và "VN ngày mai".
                  // Lọc các trận theo VN date của kickoff_at dùng timezone Asia/Ho_Chi_Minh (không cộng thủ công 7h).
                  function toVNDateStr(date: Date): string {
                    return date.toLocaleDateString('en-CA', {
                      timeZone: 'Asia/Ho_Chi_Minh'
                    });  // en-CA gives YYYY-MM-DD
                  }

                  const vnTodayStr = toVNDateStr(now);

                  const vnTomorrowBase = new Date(now.getTime() + 24 * 60 * 60 * 1000);
                  const vnTomorrowStr = toVNDateStr(vnTomorrowBase);

                  const relevantMatches = upcomingMatches
                    .filter((m: any) => {
                      const kickoff = new Date(m.kickoff_at);
                      const mVNDate = toVNDateStr(kickoff);
                      return (mVNDate === vnTodayStr || mVNDate === vnTomorrowStr) && m.status === 'scheduled';
                    })
                    .sort((a: any, b: any) => new Date(a.kickoff_at).getTime() - new Date(b.kickoff_at).getTime());

                  // Mở/locked dựa trên phút còn lại tính live (getMinutesLeft dùng `now`)
                  const openMatches = relevantMatches.filter((m: any) => getMinutesLeft(m.kickoff_at) > 0);
                  const lockedMatches = relevantMatches.filter((m: any) => getMinutesLeft(m.kickoff_at) <= 0);

                  return (
                    <>
                      {/* Mở dự đoán - các trận hôm nay và ngày mai (theo VN kickoff date) */}
                      <div>
                        <div className="font-semibold text-sm mb-2 flex items-center gap-2">
                          Mở dự đoán
                          <span className="text-xs text-[#787774]">({openMatches.length})</span>
                        </div>
                        {openMatches.length === 0 && (
                          <div className="text-xs text-[#787774] py-2">Không có trận nào còn mở dự đoán cho hôm nay/ngày mai.</div>
                        )}
                        {openMatches.map((match: any) => {
                          const homeDisplay = match.home_name_vi || match.home_name || match.home_team_label || 'TBD';
                          const awayDisplay = match.away_name_vi || match.away_name || match.away_team_label || 'TBD';
                          const timeStr = formatVNTime(match.kickoff_at);
                          const dateStr = formatShortVNDate(match.kickoff_at);
                          return (
                            <div key={match.id} className="match-card card p-5 flex items-center gap-4 mb-3">
                              {/* Aligned time column */}
                              <div className="w-16 shrink-0 text-right">
                                <div className="font-mono text-sm text-[#787774]">{timeStr}</div>
                                <div className="text-[10px] text-[#787774]">{dateStr}</div>
                              </div>
                              <div className="flex-1 grid grid-cols-[1fr_auto_1fr] items-center gap-3 min-w-0">
                                <div className="flex items-center justify-end gap-2 min-w-0">
                                  <span className="team-name text-lg truncate">{homeDisplay}</span>
                                  {match.home_flag && <img src={match.home_flag} className="flag !mr-0" alt="" />}
                                </div>
                                <span className="text-[#787774] text-sm w-8 text-center">vs</span>
                                <div className="flex items-center justify-start gap-2 min-w-0">
                                  {match.away_flag && <img src={match.away_flag} className="flag !mr-0" alt="" />}
                                  <span className="team-name text-lg truncate">{awayDisplay}</span>
                                </div>
                              </div>

                              <button 
                                onClick={() => openPredict(match)}
                                className="btn text-sm px-6 py-2.5 whitespace-nowrap flex-shrink-0"
                              >
                                Dự đoán
                              </button>
                            </div>
                          );
                        })}
                      </div>

                      {/* Đã khóa dự đoán - các trận hôm nay/ngày mai đã hết hạn cá nhân + finished hôm nay */}
                      <div>
                        <div className="font-semibold text-sm mb-2 flex items-center gap-2">
                          Đã khóa dự đoán
                          <span className="text-xs text-[#787774]">({lockedMatches.length + todayFinishedMatches.length})</span>
                        </div>
                        {lockedMatches.length === 0 && todayFinishedMatches.length === 0 && (
                          <div className="text-xs text-[#787774] py-2">Chưa có trận bị khóa cho hôm nay/ngày mai.</div>
                        )}
                        {[...lockedMatches, ...todayFinishedMatches].map((match: any) => {
                          const homeDisplay = match.home_name_vi || match.home_name || match.home_team_label || 'TBD';
                          const awayDisplay = match.away_name_vi || match.away_name || match.away_team_label || 'TBD';
                          const timeStr = formatVNTime(match.kickoff_at);
                          const dateStr = formatShortVNDate(match.kickoff_at);
                          return (
                            <div key={match.id} className="card p-5 flex items-center gap-4 mb-3 opacity-75">
                              {/* Aligned time column */}
                              <div className="w-16 shrink-0 text-right">
                                <div className="font-mono text-sm text-[#787774]">{timeStr}</div>
                                <div className="text-[10px] text-[#787774]">{dateStr}</div>
                              </div>
                              <div className="flex-1 grid grid-cols-[1fr_auto_1fr] items-center gap-3 min-w-0">
                                <div className="flex items-center justify-end gap-2 min-w-0">
                                  <span className="team-name text-lg truncate">{homeDisplay}</span>
                                  {match.home_flag && <img src={match.home_flag} className="flag !mr-0" alt="" />}
                                </div>
                                {match.home_score != null && match.away_score != null ? (
                                  <span className="font-mono text-lg tabular-nums font-semibold tracking-tighter text-center whitespace-nowrap">{match.home_score} - {match.away_score}</span>
                                ) : (
                                  <span className="text-[#787774] text-sm w-8 text-center">vs</span>
                                )}
                                <div className="flex items-center justify-start gap-2 min-w-0">
                                  {match.away_flag && <img src={match.away_flag} className="flag !mr-0" alt="" />}
                                  <span className="team-name text-lg truncate">{awayDisplay}</span>
                                </div>
                              </div>
                              <span className="text-xs px-4 py-2 text-[#787774] border border-[#EAEAEA] rounded flex-shrink-0">
                                {match.status === 'finished' ? 'Đã kết thúc' : (match.predict_status || 'Đã khóa')}
                              </span>
                            </div>
                          );
                        })}
                      </div>

                      {relevantMatches.length === 0 && <div className="text-[#787774] py-8 text-center">Chưa có trận nào cho hôm nay/ngày mai.</div>}
                      <div className="text-[10px] text-[#787774] mt-1">
                        Chỉ mở dự đoán cho các trận có ngày thi đấu (theo giờ VN) rơi vào hôm nay hoặc ngày mai. 
                        Trận xa hơn sẽ tự động xuất hiện khi đến ngày. Mỗi trận vẫn tự khóa trước 10 phút trước giờ bắt đầu (giờ server).
                      </div>
                    </>
                  );
                })()}
              </div>
            )}

            {activeTab === 'finished' && (() => {
              // Only show matches that have actually kicked off (kickoff_at <= now)
              const pastFinished = finishedMatches
                .filter((m: any) => new Date(m.kickoff_at) <= now)
                .sort((a: any, b: any) => new Date(b.kickoff_at).getTime() - new Date(a.kickoff_at).getTime());

              const todayStr = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
              const earlierMatches = pastFinished.filter((m: any) => {
                return new Date(m.kickoff_at).toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }) !== todayStr;
              });

              const renderMatchRow = (match: any) => {
                const homeVi = match.home_name_vi || match.home_name || match.home;
                const awayVi = match.away_name_vi || match.away_name || match.away;
                const timeStr = formatVNTime(match.kickoff_at);
                const dateStr = formatShortVNDate(match.kickoff_at);
                return (
                  <div key={match.id} className="card p-5">
                    <div className="flex gap-4 items-center">
                      <div className="w-16 shrink-0 text-right">
                        <div className="font-mono text-sm text-[#787774]">{timeStr}</div>
                        <div className="text-[10px] text-[#787774]">{dateStr}</div>
                      </div>
                      <div className="flex-1 grid grid-cols-[1fr_auto_1fr] items-center gap-3 min-w-0">
                        <div className="flex items-center justify-end gap-2 min-w-0">
                          <span className="team-name truncate">{homeVi}</span>
                          {match.home_flag && <img src={match.home_flag} className="flag !mr-0" alt="" />}
                        </div>
                        <span className="font-mono text-xl tabular-nums font-semibold tracking-tighter w-16 text-center">{match.home_score} - {match.away_score}</span>
                        <div className="flex items-center justify-start gap-2 min-w-0">
                          {match.away_flag && <img src={match.away_flag} className="flag !mr-0" alt="" />}
                          <span className="team-name truncate">{awayVi}</span>
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 pt-3 border-t border-[#EAEAEA] text-xs flex gap-4 text-[#787774]">
                      <span>Đúng tỷ số: <span className="font-medium text-[#346538]">{match.correctExact || '-'}</span></span>
                      <span>Đúng đội thắng: <span className="font-medium text-[#1F6C9F]">{match.correctWinner || '-'}</span></span>
                    </div>
                  </div>
                );
              };

              return (
                <div className="space-y-6">
                  {/* Earlier matches - scrollable, max 6 visible */}
                  {earlierMatches.length > 0 && (
                    <div>
                      <div className="font-semibold text-sm mb-3 flex items-center gap-2">
                        Trước đó
                        <span className="text-xs text-[#787774]">({earlierMatches.length} trận)</span>
                      </div>
                      <div className="max-h-[480px] overflow-y-auto space-y-3 pr-1">
                        {earlierMatches.map(renderMatchRow)}
                      </div>
                    </div>
                  )}

                  {earlierMatches.length === 0 && (
                    <div className="text-sm text-[#787774] py-8 text-center">Chưa có trận nào kết thúc.</div>
                  )}
                </div>
              );
            })()}

          </div>
        </div>

        {/* Real Admin CMS (toggle) */}
        {showAdmin && currentUser?.role === 'admin' && (
          <div className="mt-12 border-t pt-8 border-[#EAEAEA]">
            <div className="uppercase text-xs tracking-widest text-[#787774] mb-4 flex items-center gap-2">
              CMS • Admin only <span className="text-[10px] text-[#1F6C9F]">(admin / admin123)</span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Users Management */}
              <div className="card p-6">
                <div className="font-semibold mb-4 flex items-center justify-between">
                  Quản lý người chơi 
                  <button onClick={async () => {
                    const { getAllUsersAction } = await import('@/lib/actions');
                    setAdminUsers(await getAllUsersAction());
                  }} className="text-xs underline">Refresh</button>
                </div>
                <div className="space-y-2 text-sm max-h-64 overflow-auto">
                  {paginatedAdminUsers.length === 0 && <div className="text-[#787774]">Chưa có user nào.</div>}
                  {paginatedAdminUsers.map((u: any) => (
                    <div key={u.id} className="flex items-center justify-between border border-[#EAEAEA] rounded p-2">
                      <div>
                        <span className="font-medium">{u.username}</span>
                        <span className="text-xs text-[#787774] ml-2">{u.role}</span>
                        {!u.is_active && <span className="ml-2 text-[10px] text-orange-600">PENDING</span>}
                      </div>
                      <div className="flex gap-2 text-xs">
                        <button 
                          onClick={() => {
                            setAuditSearch(u.username);
                            setAuditActionFilter("");
                            setAuditFrom("");
                            setAuditTo("");
                            setAuditPage(1);
                          }} 
                          className="px-2 py-0.5 border rounded text-[#1F6C9F] hover:bg-[#F7F6F3]"
                        >
                          Logs
                        </button>
                        {!u.is_active && (
                          <button onClick={async () => {
                            const { activateUserAction } = await import('@/lib/actions');
                            await activateUserAction(u.id);
                            const { getAllUsersAction } = await import('@/lib/actions');
                            setAdminUsers(await getAllUsersAction());
                          }} className="px-2 py-0.5 border rounded text-[#1F6C9F]">Kích hoạt</button>
                        )}
                        <button onClick={async () => {
                          if (!await confirm(`Xóa user ${u.username}?`)) return;
                          const { deleteUserAction } = await import('@/lib/actions');
                          await deleteUserAction(u.id);
                          const { getAllUsersAction } = await import('@/lib/actions');
                          setAdminUsers(await getAllUsersAction());
                        }} className="px-2 py-0.5 border rounded text-red-600">Xóa</button>
                      </div>
                    </div>
                  ))}
                </div>
                {totalAdminUserPages > 1 && (
                  <div className="flex justify-between items-center mt-2 text-xs text-[#787774]">
                    <span>Trang {adminUserPage}/{totalAdminUserPages}</span>
                    <div className="flex gap-1">
                      <button onClick={() => setAdminUserPage(p => Math.max(1, p-1))} disabled={adminUserPage===1} className="px-1.5 border rounded disabled:opacity-50">←</button>
                      <button onClick={() => setAdminUserPage(p => Math.min(totalAdminUserPages, p+1))} disabled={adminUserPage===totalAdminUserPages} className="px-1.5 border rounded disabled:opacity-50">→</button>
                    </div>
                  </div>
                )}
              </div>

              {/* Match Score Editing + Recalc */}
              <div className="card p-6 space-y-6">
                {/* Section 1: Set new score */}
                <div>
                  <div className="font-semibold mb-2">Cập nhật tỷ số trận mới</div>
                  <div className="text-xs text-[#787774] mb-2">Trận đã/sắp diễn ra chưa có tỷ số.</div>
                  
                  <div className="flex flex-wrap gap-2 items-end">
                    <select id="admin-match-select-new" className="input text-sm" style={{minWidth: '220px'}}>
                      {matches.filter((m:any) => m.status === 'scheduled')
                        .sort((a:any, b:any) => new Date(a.kickoff_at).getTime() - new Date(b.kickoff_at).getTime())
                        .slice(0, 30).map((m:any) => (
                        <option key={m.id} value={m.id}>
                          #{m.id} {m.home_name_vi || m.home_name} vs {m.away_name_vi || m.away_name} ({m.kickoff_at ? new Date(m.kickoff_at).toLocaleDateString('vi-VN', {timeZone:'Asia/Ho_Chi_Minh'}) : ''})
                        </option>
                      ))}
                      {matches.filter((m:any) => m.status === 'scheduled').length === 0 && (
                        <option disabled>Tất cả trận đã có tỷ số</option>
                      )}
                    </select>
                    <input id="admin-home-new" type="number" placeholder="Home" className="input w-20 text-sm" defaultValue="0" />
                    <input id="admin-away-new" type="number" placeholder="Away" className="input w-20 text-sm" defaultValue="0" />
                    <button 
                      onClick={async () => {
                        const sel = document.getElementById('admin-match-select-new') as HTMLSelectElement | null;
                        const h = document.getElementById('admin-home-new') as HTMLInputElement | null;
                        const a = document.getElementById('admin-away-new') as HTMLInputElement | null;
                        if (!sel || !h || !a) { toast('Form không tìm thấy', 'error'); return; }
                        if (!sel.value) { toast('Chọn trận', 'error'); return; }
                        const hs = parseInt(h.value), as = parseInt(a.value);
                        if (isNaN(hs) || isNaN(as)) { toast('Nhập điểm hợp lệ', 'error'); return; }
                        const { setMatchScore } = await import('@/lib/actions');
                        await setMatchScore(sel.value, hs, as, true);
                        toast(`Đã set tỷ số ${hs}-${as} cho trận #${sel.value}.`, 'success');
                        const { getMatches } = await import('@/lib/actions');
                        setMatches(await getMatches());
                      }} 
                      className="btn text-sm"
                    >
                      Set Score
                    </button>
                  </div>
                </div>

                {/* Section 2: Edit existing score */}
                <div>
                  <div className="font-semibold mb-2">Sửa tỷ số trận</div>
                  <div className="text-xs text-[#787774] mb-2">Trận đã có tỷ số cần chỉnh sửa.</div>
                  
                  <div className="flex flex-wrap gap-2 items-end">
                    <select id="admin-match-select-edit" className="input text-sm" style={{minWidth: '260px'}}
                      onChange={(e) => {
                        const m = matches.find((x:any) => x.id === e.target.value);
                        const h = document.getElementById('admin-home-edit') as HTMLInputElement | null;
                        const a = document.getElementById('admin-away-edit') as HTMLInputElement | null;
                        if (m && h && a) { h.value = m.home_score ?? ''; a.value = m.away_score ?? ''; }
                      }}>
                      {matches.filter((m:any) => m.status === 'finished')
                        .sort((a:any, b:any) => new Date(b.kickoff_at).getTime() - new Date(a.kickoff_at).getTime())
                        .slice(0, 30).map((m:any) => (
                        <option key={m.id} value={m.id}>
                          #{m.id} {m.home_name_vi || m.home_name} {m.home_score}-{m.away_score} {m.away_name_vi || m.away_name} ({m.kickoff_at ? new Date(m.kickoff_at).toLocaleDateString('vi-VN', {timeZone:'Asia/Ho_Chi_Minh'}) : ''})
                        </option>
                      ))}
                      {matches.filter((m:any) => m.status === 'finished').length === 0 && (
                        <option disabled>Chưa có trận nào kết thúc</option>
                      )}
                    </select>
                    <input id="admin-home-edit" type="number" placeholder="Home" className="input w-20 text-sm" defaultValue="0" />
                    <input id="admin-away-edit" type="number" placeholder="Away" className="input w-20 text-sm" defaultValue="0" />
                    <button 
                      onClick={async () => {
                        const sel = document.getElementById('admin-match-select-edit') as HTMLSelectElement | null;
                        const h = document.getElementById('admin-home-edit') as HTMLInputElement | null;
                        const a = document.getElementById('admin-away-edit') as HTMLInputElement | null;
                        if (!sel || !h || !a) { toast('Form không tìm thấy', 'error'); return; }
                        if (!sel.value) { toast('Chọn trận', 'error'); return; }
                        const hs = parseInt(h.value), as = parseInt(a.value);
                        if (isNaN(hs) || isNaN(as)) { toast('Nhập điểm hợp lệ', 'error'); return; }
                        if (!await confirm(`Xác nhận sửa tỷ số trận #${sel.value} thành ${hs}-${as}?`)) return;
                        const { setMatchScore } = await import('@/lib/actions');
                        await setMatchScore(sel.value, hs, as, true);
                        toast(`Đã sửa tỷ số thành ${hs}-${as} cho trận #${sel.value}.`, 'success');
                        const { getMatches } = await import('@/lib/actions');
                        setMatches(await getMatches());
                      }} 
                      className="btn text-sm"
                    >
                      Sửa Score
                    </button>
                  </div>
                </div>

                <div>
                  <div className="font-semibold mb-2 text-sm">Đồng bộ từ JSON</div>
                  <div className="text-xs text-[#787774] mb-2">
                    Fetch từ openfootball/worldcup.json và cập nhật tỷ số các trận đã có score.ft. Không xóa dữ liệu hiện có.
                  </div>
                  <button 
                    onClick={async () => {
                      if (!await confirm("Sync tỷ số từ worldcup.json?")) return;
                      try {
                        const { syncScoresFromJson } = await import('@/lib/actions');
                        const result = await syncScoresFromJson();
                        let msg = `Sync hoàn tất: cập nhật ${result.updatedCount ?? 0} trận`;
                        if (result.resetCount) msg += `, reset ${result.resetCount} trận`;
                        if (result.skippedMatchIds?.length) msg += `, bỏ qua ${result.skippedMatchIds.length} trận tương lai`;
                        toast(msg + '.', 'success');
                        const { getMatches } = await import('@/lib/actions');
                        setMatches(await getMatches());
                      } catch (e: any) {
                        toast('Sync thất bại: ' + (e.message || 'Lỗi'), 'error');
                      }
                    }} 
                    className="btn text-sm"
                  >
                    Sync tỷ số từ JSON
                  </button>
                </div>

                <div>
                  <button 
                    onClick={async () => {
                      if (!await confirm("Recalculate toàn bộ điểm và streak cho tất cả người chơi?")) return;
                      const { triggerFullRecalc } = await import('@/lib/actions');
                      await triggerFullRecalc();
                      toast("Đã recalculate xong! Refresh để xem leaderboard và history cập nhật.", 'success');
                      window.location.reload();
                    }} 
                    className="btn text-sm"
                  >
                    Recalculate toàn bộ điểm + streak
                  </button>
                  <div className="text-[10px] text-[#787774] mt-1">Chạy lại scoring engine sau khi bạn set/sửa score.</div>
                </div>

                {/* Nice Audit Logs Viewer with filters */}
                <div className="card p-6 lg:col-span-2">
                  <div className="font-semibold mb-3">Audit Logs (tránh tranh chấp)</div>
                  <div className="text-xs text-[#787774] mb-3">
                    Log mọi tương tác dự đoán + admin actions (server time). Dùng để giải quyết tranh chấp nhanh.
                  </div>

                  {/* Filters */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 mb-3 text-xs">
                    <input 
                      placeholder="Tìm (action, user, chi tiết)" 
                      className="input text-sm" 
                      value={auditSearch} 
                      onChange={(e) => { setAuditSearch(e.target.value); setAuditPage(1); }} 
                    />
                    <select 
                      className="input text-sm" 
                      value={auditActionFilter} 
                      onChange={(e) => { setAuditActionFilter(e.target.value); setAuditPage(1); }}
                    >
                      <option value="">Tất cả action</option>
                      <option value="prediction_submitted">prediction_submitted</option>
                      <option value="prediction_updated">prediction_updated</option>
                      <option value="prediction_rejected_deadline">prediction_rejected_deadline</option>
                      <option value="prediction_rejected_edit_limit">prediction_rejected_edit_limit</option>
                      <option value="login_success">login_success</option>
                      <option value="login_failed">login_failed</option>
                      <option value="admin_set_match_score">admin_set_match_score</option>
                      <option value="admin_full_recalc">admin_full_recalc</option>
                      <option value="admin_activate_user">admin_activate_user</option>
                    </select>
                    <input type="date" className="input text-sm" value={auditFrom} onChange={(e) => { setAuditFrom(e.target.value); setAuditPage(1); }} />
                    <input type="date" className="input text-sm" value={auditTo} onChange={(e) => { setAuditTo(e.target.value); setAuditPage(1); }} />
                    <div className="flex gap-2">
                      <button onClick={() => { /* reactive */ }} className="text-xs px-3 py-1 border border-[#EAEAEA] rounded hover:bg-white">Lọc</button>
                      <button onClick={() => {
                        setAuditSearch(""); setAuditActionFilter(""); setAuditFrom(""); setAuditTo(""); setAuditPage(1);
                      }} className="text-xs px-3 py-1 border border-[#EAEAEA] rounded">Reset</button>
                    </div>
                  </div>

                  <div className="text-[10px] text-[#787774] mb-2 flex justify-between items-center">
                    <span>Hiển thị {paginatedAuditLogs.length} / {filteredAuditLogs.length} (trang {auditPage}/{totalAuditPages})</span>
                    <div className="flex gap-1">
                      <button 
                        onClick={() => setAuditPage(p => Math.max(1, p-1))} 
                        disabled={auditPage === 1}
                        className="px-2 py-0.5 border border-[#EAEAEA] rounded text-xs disabled:opacity-50"
                      >
                        ←
                      </button>
                      <button 
                        onClick={() => setAuditPage(p => Math.min(totalAuditPages, p+1))} 
                        disabled={auditPage === totalAuditPages}
                        className="px-2 py-0.5 border border-[#EAEAEA] rounded text-xs disabled:opacity-50"
                      >
                        →
                      </button>
                    </div>
                  </div>

                  <div className="overflow-auto max-h-72 border border-[#EAEAEA] rounded">
                    <table className="table text-xs w-full">
                      <thead>
                        <tr>
                          <th>Time</th>
                          <th>User</th>
                          <th>Action</th>
                          <th>Target</th>
                          <th>Details</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedAuditLogs.length === 0 && (
                          <tr><td colSpan={5} className="text-center py-4 text-[#787774]">Không có log phù hợp filter.</td></tr>
                        )}
                        {paginatedAuditLogs.map((log: any, idx: number) => {
                          let detailsStr = '';
                          try { 
                            const d = log.details ? JSON.parse(log.details) : {}; 
                            detailsStr = JSON.stringify(d).slice(0, 100) + (JSON.stringify(d).length > 100 ? '...' : '');
                          } catch { detailsStr = (log.details || '').slice(0, 100); }
                          return (
                            <tr key={idx} className="border-t hover:bg-[#F7F6F3]">
                              <td className="font-mono text-[10px]">{new Date(log.created_at).toLocaleString('vi-VN')}</td>
                              <td className="font-medium">{log.username || log.user_id || '-'}</td>
                              <td><span className={`text-xs font-medium ${getActionColor(log.action)}`}>{log.action}</span></td>
                              <td className="font-mono text-[10px]">{log.target_type}:{log.target_id}</td>
                              <td 
                                className="font-mono text-[10px] max-w-[220px] truncate cursor-pointer" 
                                title={log.details}
                                onClick={() => {
                                  const raw = log.details || 'No details';
                                  try { const p = JSON.parse(raw); showPopup('Audit Details', JSON.stringify(p, null, 2)); }
                                  catch { showPopup('Audit Details', raw); }
                                }}
                              >
                                {detailsStr}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="text-[10px] text-[#787774] mt-2">Click Details để xem full JSON. Dữ liệu server time, immutable.</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Auth Modals */}
      {(showLogin || showRegister) && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[110]" onClick={() => { setShowLogin(false); setShowRegister(false); setAuthError(""); }}>
          <div className="card w-full max-w-xs p-6 mx-4" onClick={e => e.stopPropagation()}>
            <div className="font-semibold mb-4">{showLogin ? "Đăng nhập" : "Đăng ký"}</div>
            
            <form onSubmit={showLogin ? handleLogin : handleRegister} className="space-y-4">
              <div>
                <div className="text-xs text-[#787774] mb-1">Username</div>
                <input 
                  type="text" 
                  value={authUsername} 
                  onChange={e => setAuthUsername(e.target.value)} 
                  className="input w-full" 
                  required 
                />
              </div>
              <div>
                <div className="text-xs text-[#787774] mb-1">Mật khẩu</div>
                <input 
                  type="password" 
                  value={authPassword} 
                  onChange={e => setAuthPassword(e.target.value)} 
                  className="input w-full" 
                  required 
                />
              </div>
              {authError && <div className="text-xs text-red-600">{authError}</div>}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => { setShowLogin(false); setShowRegister(false); setAuthError(""); }} className="flex-1 py-2 border border-[#EAEAEA] text-sm rounded">Hủy</button>
                <button type="submit" className="flex-1 py-2 btn text-sm">{showLogin ? "Đăng nhập" : "Đăng ký"}</button>
              </div>
            </form>
            
            {showLogin && (
              <div className="text-center text-xs mt-3 text-[#787774]">
                Chưa có tài khoản? <button onClick={() => { setShowLogin(false); setShowRegister(true); setAuthError(""); }} className="underline">Đăng ký ngay</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Change Password Modal */}
      {showChangePw && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[110]" onClick={() => setShowChangePw(false)}>
          <div className="card w-full max-w-xs p-6 mx-4" onClick={e => e.stopPropagation()}>
            <div className="font-semibold mb-4">Đổi mật khẩu</div>
            <div className="text-xs text-[#787774] mb-1">Mật khẩu hiện tại</div>
            <input type="password" value={pwCurrent} onChange={e => setPwCurrent(e.target.value)} className="input w-full mb-3" autoFocus />
            <div className="text-xs text-[#787774] mb-1">Mật khẩu mới (≥ 4 ký tự)</div>
            <input type="password" value={pwNew} onChange={e => setPwNew(e.target.value)} className="input w-full mb-4" />
            <div className="flex gap-3">
              <button onClick={() => setShowChangePw(false)} className="flex-1 py-2 border border-[#EAEAEA] rounded text-sm">Hủy</button>
              <button
                onClick={async () => {
                  if (pwNew.length < 4) { toast('Mật khẩu mới phải có ít nhất 4 ký tự', 'error'); return; }
                  try {
                    const { changeMyPasswordAction } = await import('@/lib/actions');
                    await changeMyPasswordAction(pwCurrent, pwNew);
                    toast('Đổi mật khẩu thành công', 'success');
                    setShowChangePw(false);
                  } catch (e: any) {
                    toast(e?.message || 'Đổi mật khẩu thất bại', 'error');
                  }
                }}
                className="flex-1 py-2 btn text-sm"
              >
                Xác nhận
              </button>
            </div>
          </div>
        </div>
      )}

      {/* History Modal */}
      {showHistory && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[110]" onClick={() => setShowHistory(false)}>
          <div className="card w-full max-w-2xl mx-4 max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-[#EAEAEA]">
              <div className="font-semibold">Lịch sử dự đoán của bạn</div>
              <button onClick={() => { setShowHistory(false); setMyPredPage(1); }} className="text-[#787774] hover:text-[#111] text-sm">Đóng</button>
            </div>
            <div className="overflow-y-auto p-5">
              {myPredictions.length === 0 ? (
                <div className="text-sm text-[#787774] py-8 text-center">Chưa có dự đoán nào. Hãy dự đoán trận sắp tới.</div>
              ) : (
                <>
                  <table className="table w-full text-sm">
                    <thead>
                      <tr>
                        <th>Trận</th>
                        <th>Dự đoán</th>
                        <th>Kết quả</th>
                        <th>Kết quả</th>
                        <th className="text-right">Điểm</th>
                        <th>Streak</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedMyPreds.map((p: any, i: number) => (
                        <tr key={i} className="border-t">
                          <td className={`font-medium ${p.editCount > 0 ? 'text-[#956400] cursor-help' : ''}`} title={p.editCount > 0 ? `Đã sửa ${p.editCount} lần` : undefined}>{p.home} vs {p.away}</td>
                          <td className="font-mono">{p.pred}</td>
                          <td className="font-mono">{p.actual}</td>
                          <td className={p.outcomeColor}>{p.outcome}</td>
                          <td className="text-right font-semibold">{p.points > 0 ? `+${p.points}` : p.points}</td>
                          <td className="text-center font-mono text-xs">{p.streakDisplay || '-'}</td>
                          <td className="text-[10px] text-[#787774]">{p.time}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="flex justify-between items-center mt-3 text-xs text-[#787774]">
                    <span>{myPredictions.length} dự đoán • Trang {myPredPage} / {totalMyPredPages}</span>
                    <div className="flex gap-1">
                      <button onClick={() => setMyPredPage(p => Math.max(1, p-1))} disabled={myPredPage===1} className="px-2 py-0.5 border border-[#EAEAEA] rounded disabled:opacity-50">←</button>
                      <button onClick={() => setMyPredPage(p => Math.min(totalMyPredPages, p+1))} disabled={myPredPage===totalMyPredPages} className="px-2 py-0.5 border border-[#EAEAEA] rounded disabled:opacity-50">→</button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Predict Modal */}
      {showPredictModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[100]" onClick={() => setShowPredictModal(null)}>
          <div className="card w-full max-w-sm p-6 mx-4" onClick={e => e.stopPropagation()}>
            <div className="font-semibold mb-1">Dự đoán trận</div>
            <div className="text-lg tracking-tight mb-5 flex items-center gap-2">
              {showPredictModal.home_flag && <img src={showPredictModal.home_flag} className="flag" alt="" />}
              {showPredictModal.home_name_vi || showPredictModal.home_name}
              <span className="text-[#787774]">vs</span>
              {showPredictModal.away_flag && <img src={showPredictModal.away_flag} className="flag" alt="" />}
              {showPredictModal.away_name_vi || showPredictModal.away_name}
            </div>

            <div className="text-[10px] text-[#787774] mb-3">
              Hạn dự đoán: trước 10 phút so với giờ bắt đầu
              {showPredictModal && (
                <> • Còn ~{getMinutesLeft(showPredictModal.kickoff_at)} phút</>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 mb-6">
              <div>
                <div className="text-xs text-[#787774] mb-1 flex items-center gap-1.5">
                  {showPredictModal.home_flag && <img src={showPredictModal.home_flag} className="flag" style={{width:'18px',height:'18px'}} alt="" />}
                  {showPredictModal.home_name_vi || showPredictModal.home_name}
                </div>
                <input type="number" min={0} max={9} value={predHome} onChange={e => setPredHome(parseInt(e.target.value)||0)} className="input w-full text-center text-2xl font-semibold" />
              </div>
              <div>
                <div className="text-xs text-[#787774] mb-1 flex items-center gap-1.5">
                  {showPredictModal.away_flag && <img src={showPredictModal.away_flag} className="flag" style={{width:'18px',height:'18px'}} alt="" />}
                  {showPredictModal.away_name_vi || showPredictModal.away_name}
                </div>
                <input type="number" min={0} max={9} value={predAway} onChange={e => setPredAway(parseInt(e.target.value)||0)} className="input w-full text-center text-2xl font-semibold" />
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setShowPredictModal(null)} className="flex-1 py-2.5 border border-[#EAEAEA] rounded text-sm">Hủy</button>
              {(() => {
                const ex = myPredictions.find((p: any) => p.matchId === showPredictModal.id);
                const editsLeft = ex ? 10 - ex.editCount : 10;
                const exhausted = editsLeft <= 0;
                return (
                  <button onClick={submitPrediction} disabled={exhausted} className="flex-1 py-2.5 btn disabled:opacity-50 disabled:cursor-not-allowed">
                    {ex ? 'Cập nhật dự đoán' : 'Gửi dự đoán'}
                  </button>
                );
              })()}
            </div>
            {(() => {
              const ex = myPredictions.find((p: any) => p.matchId === showPredictModal.id);
              const editsLeft = ex ? 10 - ex.editCount : 10;
              return (
                <div className="text-[10px] text-[#787774] text-center mt-3">
                  Có thể sửa cho đến trước giờ đá.{ex ? ` Còn ${Math.max(0, editsLeft)}/10 lần sửa.` : ''}
                </div>
              );
            })()}
          </div>
        </div>
      )}

      <footer className="text-center text-xs text-[#787774] py-10 border-t border-[#EAEAEA] mt-16">
        Demo UI theo <span className="font-medium">minimalist-ui</span> (warm monochrome • editorial • flat • generous spacing). Dành cho review nhanh.
      </footer>
    </div>
  );
}
