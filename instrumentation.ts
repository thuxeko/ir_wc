export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { ensureAdminUser } = await import('./lib/auth');
    const { startCronJobs } = await import('./lib/cron');

    await ensureAdminUser();
    startCronJobs();
  }
}
