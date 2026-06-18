'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Users, Settings, LogOut } from 'lucide-react';
import { toast } from '@/lib/toast';
import { confirm } from '@/lib/confirm';
import { showPopup } from '@/lib/popup';

export default function AdminCMS() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [adminUsers, setAdminUsers] = useState<any[]>([]);
  const [matches, setMatches] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [cronLogs, setCronLogs] = useState<any[]>([]);
  const [auditSearch, setAuditSearch] = useState("");
  const [auditActionFilter, setAuditActionFilter] = useState("");
  const [auditFrom, setAuditFrom] = useState("");
  const [auditTo, setAuditTo] = useState("");
  const [auditPage, setAuditPage] = useState(1);
  const auditPageSize = 20;
  const [isLoading, setIsLoading] = useState(true);

  const [adminUserPage, setAdminUserPage] = useState(1);
  const adminUserPageSize = 20;

  const [pwResetUser, setPwResetUser] = useState<any>(null);
  const [pwResetValue, setPwResetValue] = useState("");
  const [suspiciousMatches, setSuspiciousMatches] = useState<any>({
    finishedMissingScore: [],
    scheduledHasScore: [],
    finishedBeforeKickoff: [],
    staleScheduled: [],
    negativeScore: []
  });
  const [debugMatchId, setDebugMatchId] = useState("");
  const [debugMatchResult, setDebugMatchResult] = useState<any>(null);
  const [backups, setBackups] = useState<any[]>([]);

  // Load data
  useEffect(() => {
    (async () => {
      try {
        const { getCurrentUserAction, getAllUsersAction, getMatches, getRecentAuditLogs, getCronLogs, getSuspiciousMatches, listBackupsAction } = await import('@/lib/actions');
        const user = await getCurrentUserAction();
        
        if (!user || user.role !== 'admin') {
          router.push('/');
          return;
        }
        
        setCurrentUser(user);
        
        const [users, matchData, logs, cron, suspicious, backupList] = await Promise.all([
          getAllUsersAction(),
          getMatches(),
          getRecentAuditLogs(100),
          getCronLogs(20),
          getSuspiciousMatches(),
          listBackupsAction()
        ]);
        
        setAdminUsers(users);
        setMatches(matchData);
        setAuditLogs(logs);
        setCronLogs(cron);
        setSuspiciousMatches(suspicious);
        setBackups(backupList);
      } catch (e) {
        console.error(e);
        router.push('/');
      } finally {
        setIsLoading(false);
      }
    })();
  }, [router]);

  const filteredAuditLogs = auditLogs.filter((log: any) => {
    const search = auditSearch.toLowerCase();
    const matchesSearch = !search || 
      (log.action && log.action.toLowerCase().includes(search)) ||
      (log.username && log.username.toLowerCase().includes(search)) ||
      (log.details && log.details.toLowerCase().includes(search));
    
    const matchesAction = !auditActionFilter || log.action === auditActionFilter;
    
    let matchesDate = true;
    if (auditFrom) matchesDate = matchesDate && log.created_at >= auditFrom;
    if (auditTo) matchesDate = matchesDate && log.created_at <= auditTo + 'T23:59:59';
    return matchesSearch && matchesAction && matchesDate;
  });

  const paginatedAuditLogs = filteredAuditLogs.slice(
    (auditPage - 1) * auditPageSize,
    auditPage * auditPageSize
  );
  const totalAuditPages = Math.max(1, Math.ceil(filteredAuditLogs.length / auditPageSize));

  const paginatedAdminUsers = adminUsers.slice(
    (adminUserPage - 1) * adminUserPageSize,
    adminUserPage * adminUserPageSize
  );
  const totalAdminUserPages = Math.max(1, Math.ceil(adminUsers.length / adminUserPageSize));

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

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center">Đang tải CMS Admin...</div>;
  }

  return (
    <div className="min-h-screen">
      <nav className="border-b border-[#EAEAEA] bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-[#111] flex items-center justify-center text-white text-sm font-semibold">WC</div>
            <div>
              <div className="font-semibold tracking-tight">WC26 Predict - Admin CMS</div>
              <div className="text-[10px] text-[#787774] -mt-1">Nội bộ • 2026</div>
            </div>
          </div>

          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-[#F7F6F3] border border-[#EAEAEA]">
              <Users className="w-4 h-4" /> {currentUser?.username}
            </div>
            <a href="/" className="text-xs px-3 py-1.5 border border-[#EAEAEA] rounded hover:bg-white">Về Trang chủ</a>
            <button 
              onClick={async () => {
                const { logoutAction } = await import('@/lib/actions');
                await logoutAction();
                window.location.href = '/';
              }}
              className="text-[#787774] hover:text-[#111] flex items-center gap-1 text-xs"
            >
              <LogOut className="w-3.5 h-3.5" /> Thoát
            </button>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-6 py-10">
        <div className="uppercase text-xs tracking-widest text-[#787774] mb-4 flex items-center gap-2">
          CMS • Admin only <span className="text-[10px] text-[#1F6C9F]">(admin / admin123)</span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Users Management */}
          <div className="card p-6">
            <div className="font-semibold mb-4 flex items-center justify-between">
              Quản lý người chơi 
              <div className="flex gap-2">
                <button onClick={async () => {
                  if (!await confirm("Xoá user test (Lê Minh Tuấn, Nguyễn Quỳnh Mai, ...)? Chỉ xoá 10 user có tên khớp danh sách.")) return;
                  const { cleanTestData } = await import('@/lib/actions');
                  const result = await cleanTestData();
                  toast(`Đã xoá ${result.deletedUsers} user test` + (result.deletedUsersList.length ? `: ${result.deletedUsersList.join(', ')}` : ''), 'success');
                  const { getAllUsersAction } = await import('@/lib/actions');
                  setAdminUsers(await getAllUsersAction());
                }} className="text-xs text-red-600 border border-red-200 rounded px-2 py-0.5 hover:bg-red-50">Xoá test data</button>
                <button onClick={async () => {
                  const { getAllUsersAction } = await import('@/lib/actions');
                  setAdminUsers(await getAllUsersAction());
                }} className="text-xs underline">Refresh</button>
              </div>
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
                        // Scroll to logs section
                        setTimeout(() => {
                          const logsEl = document.getElementById('audit-logs-section');
                          if (logsEl) logsEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }, 50);
                      }} 
                      className="px-2 py-0.5 border rounded text-[#1F6C9F] hover:bg-[#F7F6F3]"
                    >
                      Xem logs
                    </button>
                    {!u.is_active && (
                      <button onClick={async () => {
                        const { activateUserAction } = await import('@/lib/actions');
                        await activateUserAction(u.id);
                        const { getAllUsersAction } = await import('@/lib/actions');
                        setAdminUsers(await getAllUsersAction());
                      }} className="px-2 py-0.5 border rounded text-[#1F6C9F]">Kích hoạt</button>
                    )}
                    <button onClick={() => { setPwResetUser(u); setPwResetValue(""); }} className="px-2 py-0.5 border rounded text-[#956400]">Đổi MK</button>
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
              <div className="text-xs text-[#787774] mb-2">Trận đã/sắp diễn ra chưa có tỷ số. Nhập xong Set Score.</div>
              
              <div className="flex flex-wrap gap-2 items-end">
                <select id="admin-match-select-new" className="input text-sm" style={{minWidth: '220px'}}>
                  {matches.filter((m:any) => m.status === 'scheduled')
                    .sort((a:any, b:any) => new Date(a.kickoff_at).getTime() - new Date(b.kickoff_at).getTime())
                    .slice(0, 30).map((m:any) => (
                    <option key={m.id} value={m.id}>
                      #{m.id} {(m.home_name_vi || m.home_name || m.home_team_label || 'TBD')} vs {(m.away_name_vi || m.away_name || m.away_team_label || 'TBD')} ({m.kickoff_at ? new Date(m.kickoff_at).toLocaleDateString('vi-VN', {timeZone:'Asia/Ho_Chi_Minh'}) : ''})
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
              <div className="text-xs text-[#787774] mb-2">Trận đã có tỷ số cần chỉnh sửa (dữ liệu lỗi, hoãn, ...).</div>
              
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
                      #{m.id} {(m.home_name_vi || m.home_name || m.home_team_label || 'TBD')} {m.home_score}-{m.away_score} {(m.away_name_vi || m.away_name || m.away_team_label || 'TBD')} ({m.kickoff_at ? new Date(m.kickoff_at).toLocaleDateString('vi-VN', {timeZone:'Asia/Ho_Chi_Minh'}) : ''})
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

            <div>
              <div className="font-semibold text-sm mb-2">Đồng bộ từ JSON</div>
              <div className="text-xs text-[#787774] mb-2">
                Fetch từ openfootball/worldcup.json, cập nhật tỷ số trận đã có score.ft.
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
                    const { getMatches, getSuspiciousMatches } = await import('@/lib/actions');
                    setMatches(await getMatches());
                    setSuspiciousMatches(await getSuspiciousMatches());
                  } catch (e: any) {
                    toast('Sync thất bại: ' + (e.message || 'Lỗi'), 'error');
                  }
                }} 
                className="btn text-sm"
              >
                Sync tỷ số từ JSON
              </button>
            </div>
          </div>

          {/* Match Debugger */}
          <div className="card p-6 lg:col-span-2">
            <div className="font-semibold mb-3">Match Debugger</div>
            <div className="text-xs text-[#787774] mb-3">
              Server time: {new Date().toISOString()} | VN: {new Date().toLocaleString('vi-VN', {timeZone:'Asia/Ho_Chi_Minh'})}
            </div>

            {/* Suspicious matches */}
            <div className="mb-4 space-y-4">
              {(() => {
                const total =
                  suspiciousMatches.finishedMissingScore.length +
                  suspiciousMatches.scheduledHasScore.length +
                  suspiciousMatches.finishedBeforeKickoff.length +
                  suspiciousMatches.staleScheduled.length +
                  suspiciousMatches.negativeScore.length;

                const renderGroup = (
                  title: string,
                  items: any[],
                  reason: string,
                  allowReset: boolean,
                  note?: string
                ) => (
                  <div>
                    <div className="font-semibold text-sm mb-2">{title} ({items.length})</div>
                    {note && <div className="text-[10px] text-[#787774] mb-2">{note}</div>}
                    {allowReset && items.length > 0 && (
                      <button
                        onClick={async () => {
                          if (!await confirm(`Reset ${items.length} trận trong nhóm này về 'scheduled'?`)) return;
                          const { fixMatchStatus } = await import('@/lib/actions');
                          for (const m of items) {
                            await fixMatchStatus(m.id, reason);
                          }
                          toast(`Đã reset ${items.length} trận về scheduled`, 'success');
                          const { getSuspiciousMatches, getMatches } = await import('@/lib/actions');
                          setSuspiciousMatches(await getSuspiciousMatches());
                          setMatches(await getMatches());
                        }}
                        className="mb-2 text-xs px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700"
                      >
                        Reset tất cả {items.length} trận
                      </button>
                    )}
                    {items.length === 0 ? (
                      <div className="text-xs text-[#787774]">Không phát hiện.</div>
                    ) : (
                      <div className="space-y-2">
                        {items.map((m: any) => (
                          <div key={`${reason}-${m.id}`} className="flex items-center justify-between border border-red-200 bg-red-50 rounded p-2 text-sm">
                            <div>
                              <span className="font-medium">#{m.id}</span> {m.home_team_id} vs {m.away_team_id}
                              {m.home_score != null && m.away_score != null && (
                                <span className="font-mono"> ({m.home_score}-{m.away_score})</span>
                              )}
                              <span className="text-[#787774] ml-1">— {new Date(m.kickoff_at).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}</span>
                            </div>
                            {allowReset && (
                              <button
                                onClick={async () => {
                                  if (!await confirm(`Reset trận #${m.id} về 'scheduled'?`)) return;
                                  const { fixMatchStatus } = await import('@/lib/actions');
                                  await fixMatchStatus(m.id, reason);
                                  toast(`Đã reset trận #${m.id} về scheduled`, 'success');
                                  const { getSuspiciousMatches, getMatches } = await import('@/lib/actions');
                                  setSuspiciousMatches(await getSuspiciousMatches());
                                  setMatches(await getMatches());
                                }}
                                className="text-xs px-2 py-0.5 border border-red-300 rounded hover:bg-white"
                              >
                                Reset về scheduled
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );

                return (
                  <>
                    <div className="text-xs text-[#787774]">
                      Tổng phát hiện: <span className="font-medium text-red-600">{total}</span> trận bất thường
                    </div>
                    {renderGroup('Finished nhưng thiếu tỷ số', suspiciousMatches.finishedMissingScore, 'finished_missing_score', true)}
                    {renderGroup('Scheduled nhưng đã có tỷ số', suspiciousMatches.scheduledHasScore, 'scheduled_has_score', true)}
                    {renderGroup('Finished trước giờ kickoff', suspiciousMatches.finishedBeforeKickoff, 'finished_before_kickoff', true)}
                    {renderGroup('Scheduled quá hạn (>3h sau kickoff)', suspiciousMatches.staleScheduled, 'stale_scheduled', false, 'Chỉ cảnh báo, cần kiểm tra thủ công')}
                    {renderGroup('Tỷ số âm', suspiciousMatches.negativeScore, 'negative_score', true)}
                  </>
                );
              })()}
            </div>

            {/* Manual match lookup */}
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <div className="text-xs text-[#787774] mb-1">Tra cứu trận theo ID</div>
                <input 
                  type="text" 
                  placeholder="Nhập match ID (vd: 3)" 
                  className="input text-sm w-full"
                  value={debugMatchId}
                  onChange={(e) => setDebugMatchId(e.target.value)}
                />
              </div>
              <button 
                onClick={async () => {
                  if (!debugMatchId) return;
                  try {
                    const { getMatchDebug } = await import('@/lib/actions');
                    const result = await getMatchDebug(debugMatchId);
                    setDebugMatchResult(result);
                  } catch (e: any) {
                    toast(e.message || 'Lỗi tra cứu', 'error');
                  }
                }}
                className="btn text-sm"
              >
                Tra cứu
              </button>
            </div>
            {debugMatchResult && (
              <div className="mt-2 p-3 bg-[#F7F6F3] rounded text-xs font-mono overflow-auto">
                <pre>{JSON.stringify(debugMatchResult, null, 2)}</pre>
              </div>
            )}
          </div>

          {/* Audit Logs Viewer */}
          <div id="audit-logs-section" className="card p-6 lg:col-span-2">
            <div className="font-semibold mb-3">Audit Logs (tránh tranh chấp)</div>
            <div className="text-xs text-[#787774] mb-3">
              Log mọi tương tác dự đoán + admin actions (server time).
            </div>

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
                <button onClick={() => {}} className="text-xs px-3 py-1 border border-[#EAEAEA] rounded hover:bg-white">Lọc</button>
                <button onClick={() => {
                  setAuditSearch(""); setAuditActionFilter(""); setAuditFrom(""); setAuditTo(""); setAuditPage(1);
                }} className="text-xs px-3 py-1 border border-[#EAEAEA] rounded">Reset</button>
              </div>
            </div>

            <div className="text-[10px] text-[#787774] mb-2">
              Hiển thị {paginatedAuditLogs.length} / {filteredAuditLogs.length} (trang {auditPage}/{totalAuditPages})
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
                    <tr><td colSpan={5} className="text-center py-4 text-[#787774]">Không có log.</td></tr>
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

            {totalAuditPages > 1 && (
              <div className="flex justify-between items-center mt-2 text-xs text-[#787774]">
                <span>Trang {auditPage}/{totalAuditPages}</span>
                <div className="flex gap-1">
                  <button onClick={() => setAuditPage(p => Math.max(1, p-1))} disabled={auditPage===1} className="px-2 py-0.5 border border-[#EAEAEA] rounded disabled:opacity-50">←</button>
                  <button onClick={() => setAuditPage(p => Math.min(totalAuditPages, p+1))} disabled={auditPage===totalAuditPages} className="px-2 py-0.5 border border-[#EAEAEA] rounded disabled:opacity-50">→</button>
                </div>
              </div>
            )}
            <div className="text-[10px] text-[#787774] mt-2">Click Details để xem full. Server time, immutable.</div>
          </div>

          {/* Backup & Restore */}
          <div className="card p-6 lg:col-span-2">
            <div className="font-semibold mb-3">Backup & Restore</div>
            <div className="text-xs text-[#787774] mb-3">
              Backup file SQLite hoặc export CSV để khôi phục dữ liệu khi có lỗi. Auto-snapshot cũng được tạo trước mỗi thao tác nguy hiểm.
            </div>

            <div className="flex flex-wrap gap-2 mb-4">
              <button
                onClick={async () => {
                  try {
                    const { backupDatabaseAction } = await import('@/lib/actions');
                    const result = await backupDatabaseAction();
                    toast(`Đã backup DB: ${result.filename} (${(result.size / 1024).toFixed(1)} KB)`, 'success');
                    const { listBackupsAction } = await import('@/lib/actions');
                    setBackups(await listBackupsAction());
                  } catch (e: any) {
                    toast('Backup thất bại: ' + (e.message || 'Lỗi'), 'error');
                  }
                }}
                className="btn text-sm"
              >
                Backup DB ngay
              </button>
              <button
                onClick={async () => {
                  try {
                    const { exportPredictionsCsvAction } = await import('@/lib/actions');
                    const result = await exportPredictionsCsvAction();
                    toast(`Đã export ${result.count} dự đoán ra ${result.filename}`, 'success');
                    const { listBackupsAction } = await import('@/lib/actions');
                    setBackups(await listBackupsAction());
                  } catch (e: any) {
                    toast('Export CSV thất bại: ' + (e.message || 'Lỗi'), 'error');
                  }
                }}
                className="btn text-sm"
              >
                Export predictions CSV
              </button>
              <button
                onClick={async () => {
                  try {
                    const { exportUsersCsvAction } = await import('@/lib/actions');
                    const result = await exportUsersCsvAction();
                    toast(`Đã export ${result.count} users ra ${result.filename}`, 'success');
                    const { listBackupsAction } = await import('@/lib/actions');
                    setBackups(await listBackupsAction());
                  } catch (e: any) {
                    toast('Export CSV thất bại: ' + (e.message || 'Lỗi'), 'error');
                  }
                }}
                className="btn text-sm"
              >
                Export users CSV
              </button>
              <button
                onClick={async () => {
                  if (!await confirm('Xóa các backup cũ hơn 14 ngày?')) return;
                  try {
                    const { cleanupOldBackupsAction } = await import('@/lib/actions');
                    const result = await cleanupOldBackupsAction();
                    toast(`Đã xóa ${result.deleted.length} file backup cũ`, 'success');
                    const { listBackupsAction } = await import('@/lib/actions');
                    setBackups(await listBackupsAction());
                  } catch (e: any) {
                    toast('Dọn dẹp thất bại: ' + (e.message || 'Lỗi'), 'error');
                  }
                }}
                className="text-sm px-3 py-1.5 border border-[#EAEAEA] rounded hover:bg-white"
              >
                Xóa backup {'>'}14 ngày
              </button>
            </div>

            <div className="text-xs font-semibold mb-2">Danh sách backup ({backups.length})</div>
            <div className="overflow-auto max-h-60 border border-[#EAEAEA] rounded">
              <table className="table text-xs w-full">
                <thead>
                  <tr>
                    <th>File</th>
                    <th>Thờ gian</th>
                    <th>Kích thước</th>
                  </tr>
                </thead>
                <tbody>
                  {backups.length === 0 && (
                    <tr><td colSpan={3} className="text-center py-4 text-[#787774]">Chưa có backup.</td></tr>
                  )}
                  {backups.map((b: any) => (
                    <tr key={b.filename} className="border-t">
                      <td className="font-mono text-[10px]">{b.filename}</td>
                      <td>{new Date(b.createdAt).toLocaleString('vi-VN')}</td>
                      <td>{(b.size / 1024).toFixed(1)} KB</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="text-[10px] text-[#787774] mt-2">
              File backup lưu tại <span className="font-mono">data/backups/</span>. Để restore, dừng app và copy file .db ghi đè lên data/wc2026.db.
            </div>
          </div>

          {/* Cron Logs */}
          <div className="card p-6 lg:col-span-2">
            <div className="font-semibold mb-3">Lịch sử đồng bộ tự động (Cron)</div>
            {cronLogs.length === 0 ? (
              <div className="text-sm text-[#787774]">Chưa có lịch sử.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="table w-full text-sm">
                  <thead>
                    <tr className="text-left text-[#787774]">
                      <th className="pb-2 font-normal">Thờ gian bắt đầu</th>
                      <th className="pb-2 font-normal">Thờ gian kết thúc</th>
                      <th className="pb-2 font-normal">Trạng thái</th>
                      <th className="pb-2 font-normal">Trận cập nhật</th>
                      <th className="pb-2 font-normal">Lỗi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cronLogs.map((log: any) => (
                      <tr key={log.id} className="border-t border-[#F0F0EE]">
                        <td className="py-2">{log.started_at ? new Date(log.started_at).toLocaleString('vi-VN') : '-'}</td>
                        <td className="py-2">{log.finished_at ? new Date(log.finished_at).toLocaleString('vi-VN') : '-'}</td>
                        <td className="py-2">
                          <span className={`inline-block px-1.5 py-0.5 rounded text-xs ${
                            log.status === 'success' ? 'bg-green-100 text-green-700' :
                            log.status === 'failed' ? 'bg-red-100 text-red-700' :
                            'bg-yellow-100 text-yellow-700'
                          }`}>{log.status}</span>
                        </td>
                        <td className="py-2">{log.updated_count ?? 0}</td>
                        <td className="py-2 text-red-600 max-w-[200px] truncate" title={log.error_message || ''}>{log.error_message || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="mt-8 text-center">
          <a href="/" className="text-sm text-[#787774] hover:text-[#111]">← Quay về trang chủ</a>
        </div>
      </div>

      {/* Reset Password Modal */}
      {pwResetUser && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[210]" onClick={() => setPwResetUser(null)}>
          <div className="card w-full max-w-xs p-6 mx-4" onClick={e => e.stopPropagation()}>
            <div className="font-semibold mb-1">Đổi mật khẩu</div>
            <div className="text-xs text-[#787774] mb-4">User: <span className="font-medium text-[#111]">{pwResetUser.username}</span></div>
            <div className="text-xs text-[#787774] mb-1">Mật khẩu mới (≥ 4 ký tự)</div>
            <input
              type="text"
              value={pwResetValue}
              onChange={e => setPwResetValue(e.target.value)}
              className="input w-full mb-4"
              placeholder="Nhập mật khẩu mới"
              autoFocus
            />
            <div className="flex gap-3">
              <button onClick={() => setPwResetUser(null)} className="flex-1 py-2 border border-[#EAEAEA] rounded text-sm">Hủy</button>
              <button
                onClick={async () => {
                  if (pwResetValue.length < 4) { toast('Mật khẩu phải có ít nhất 4 ký tự', 'error'); return; }
                  try {
                    const { adminResetPasswordAction } = await import('@/lib/actions');
                    await adminResetPasswordAction(pwResetUser.id, pwResetValue);
                    toast(`Đã đổi mật khẩu cho ${pwResetUser.username}`, 'success');
                    setPwResetUser(null);
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
    </div>
  );
}
