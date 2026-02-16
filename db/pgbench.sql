-- DRACIN Database Benchmark Queries
-- For PostgreSQL (pgbench compatible)

-- 1. Concurrent user lookup
SELECT id, username, email, role, status, vip_expires_at FROM users WHERE username = 'benchmark_user' LIMIT 1;

-- 2. VIP validation query (high frequency)
SELECT u.id, u.username, s.plan_id, s.status, s.expires_at 
FROM users u 
LEFT JOIN subscriptions s ON u.id = s.user_id AND s.status = 'active'
WHERE u.id = '00000000-0000-0000-0000-000000000001';

-- 3. Referral summary aggregation
SELECT r.referrer_id, COUNT(r.id) as total_referrals, 
       SUM(CASE WHEN r.status = 'subscribed' THEN 1 ELSE 0 END) as subscribed,
       COALESCE(SUM(rc.amount), 0) as total_earnings
FROM referral_links r
LEFT JOIN referral_commissions rc ON r.referrer_id = rc.referrer_id
WHERE r.referrer_id = '00000000-0000-0000-0000-000000000001'
GROUP BY r.referrer_id;

-- 4. Watch history with pagination
SELECT wh.*, COUNT(*) OVER() as total_count
FROM watch_history wh 
WHERE wh.user_id = '00000000-0000-0000-0000-000000000001'
ORDER BY wh.updated_at DESC 
LIMIT 20 OFFSET 0;

-- 5. Session validation (every authenticated request)
SELECT s.id, s.user_id, s.expires_at, u.status, u.role
FROM sessions s
JOIN users u ON s.user_id = u.id
WHERE s.id = '00000000-0000-0000-0000-000000000001'
AND s.expires_at > NOW()
AND s.revoked_at IS NULL;

-- 6. Transaction history
SELECT t.*, sp.name as plan_name
FROM transactions t
LEFT JOIN subscription_plans sp ON t.plan_id = sp.id
WHERE t.user_id = '00000000-0000-0000-0000-000000000001'
ORDER BY t.created_at DESC LIMIT 10;
