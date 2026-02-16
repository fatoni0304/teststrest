-- Heavy Query Stress Test for DRACIN PostgreSQL
-- Run with: psql -f heavy-query-test.sql

-- 1. Full table scan simulation
EXPLAIN ANALYZE SELECT COUNT(*) FROM users;
EXPLAIN ANALYZE SELECT COUNT(*) FROM sessions WHERE expires_at > NOW();
EXPLAIN ANALYZE SELECT COUNT(*) FROM transactions WHERE status = 'paid';

-- 2. Complex join (referral chain)
EXPLAIN ANALYZE
SELECT u.username, COUNT(rl.id) as referral_count,
       COALESCE(SUM(rc.amount), 0) as total_commission,
       COUNT(DISTINCT CASE WHEN rl.status = 'subscribed' THEN rl.referred_user_id END) as subscribed_count
FROM users u
LEFT JOIN referral_links rl ON u.id = rl.referrer_id
LEFT JOIN referral_commissions rc ON u.id = rc.referrer_id
GROUP BY u.id, u.username
ORDER BY total_commission DESC
LIMIT 50;

-- 3. Concurrent VIP check (simulates 10k reads)
EXPLAIN ANALYZE
SELECT u.id, u.username,
       CASE WHEN s.expires_at > NOW() THEN true ELSE false END as is_vip,
       s.plan_id, s.expires_at
FROM users u
LEFT JOIN subscriptions s ON u.id = s.user_id AND s.status = 'active'
ORDER BY u.created_at DESC
LIMIT 1000;

-- 4. Activity log aggregation
EXPLAIN ANALYZE
SELECT DATE(created_at) as day, action, COUNT(*) as count
FROM activity_logs
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at), action
ORDER BY day DESC, count DESC;

-- 5. Watch history stats
EXPLAIN ANALYZE
SELECT u.id, u.username, COUNT(wh.id) as total_watched,
       SUM(wh.duration) as total_duration,
       MAX(wh.updated_at) as last_watch
FROM users u
LEFT JOIN watch_history wh ON u.id = wh.user_id
GROUP BY u.id, u.username
HAVING COUNT(wh.id) > 0
ORDER BY total_watched DESC LIMIT 100;
