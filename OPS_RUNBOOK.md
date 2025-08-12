# HBUK.xyz Operations Runbook

## 🚀 Production Deployment Status

**Current Version**: Immutability v1 + Auditable + Enterprise-Grade  
**Backend**: Render (hbuk-backend-hvow.onrender.com)  
**Frontend**: Netlify (hbuk.xyz)  
**Database**: MongoDB Atlas  

## 🔐 Environment Variables (Render)

### Required Secrets
```bash
JWT_SECRET=<long-random-string-64+chars>
HBUK_SIGNING_SECRET=<long-random-string-64+chars>
HBUK_SIGNING_KID=v1
MONGODB_URI=<mongodb-atlas-connection-string>
RESEND_API_KEY=<resend-api-key>
NODE_ENV=production
```

### Secret Rotation Policy (Quarterly)
1. Generate new `HBUK_SIGNING_SECRET` (64+ random chars)
2. Increment `HBUK_SIGNING_KID` (v1 → v2 → v3...)
3. Deploy backend
4. New commits carry new `sigKid`; old receipts remain valid

## 🚨 Incident Response Playbook

### Login Failing?
1. **Check Frontend**: Netlify DevTools → Network tab
2. **Copy Details**: Status + Response body + `X-HBUK-ReqId`
3. **Check Backend**: Render logs → search for `X-HBUK-ReqId`
4. **Common Issues**: JWT expiry, rate limiting, CORS

### Database Issues?
1. **Health Check**: `GET /health/db`
2. **If Fails**: Check Atlas Network Access + Render env vars
3. **Connection**: Verify `MONGODB_URI` format and IP whitelist

### High 429 (Rate Limit) Errors?
1. **Check Limits**: Current limits in response headers
2. **Temporary Fix**: Increase `max` in rate limiters
3. **Permanent Fix**: Add per-route overrides or increase global limits

### Anchor Mismatch Reports?
1. **Fetch Current**: `GET /api/anchors/today`
2. **Get Proof**: `GET /api/anchors/proof/:id` (authenticated)
3. **Verify Locally**: Recompute Merkle root with provided proof
4. **Check Logs**: Look for any database inconsistencies

### Secret Rotation Issues?
1. **Verify Old Receipts**: Should still verify with stored signatures
2. **Check New Commits**: Should carry new `sigKid`
3. **Rollback**: Revert to previous `HBUK_SIGNING_SECRET` if needed

## 📊 Monitoring & Alerts

### Health Endpoints
- **Backend Health**: `GET /health` (200 OK)
- **Database Health**: `GET /health/db` (200 OK)
- **Daily Anchor**: `GET /api/anchors/today` (cached 60s)

### Uptime Monitoring
- **Frequency**: Every 1 minute
- **Alert Threshold**: ≥2 consecutive failures
- **Endpoints**: `/health`, `/health/db`

### MongoDB Atlas Alerts
- **Connection Spikes**: Monitor connection count
- **Slow Queries**: Query performance alerts
- **Disk Usage**: Storage alerts
- **Backups**: Daily automated backups enabled

## 🔧 Rate Limiting Configuration

### Current Limits
```javascript
// Auth endpoints: 50 requests per 5 minutes
const authLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 50
});

// Write endpoints: 30 requests per minute
const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30
});

// Public endpoints: 120 requests per minute
const publicLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120
});
```

### Adjusting Limits
1. **Temporary**: Increase `max` values
2. **Permanent**: Modify rate limiters in `server.js`
3. **Per-Route**: Add specific overrides for critical endpoints

## 📈 Performance Optimization

### Caching
- **Anchors**: 60-second cache on daily anchors
- **Entries**: Pagination (20 per page, max 100)
- **Health**: No cache (real-time status)

### Database Indexes
```javascript
// Users collection
{ email: 1 } // unique index

// Entries collection  
{ userId: 1, createdAt: -1 } // compound index
```

### Connection Pooling
- **MongoDB**: maxPoolSize: 10
- **Timeouts**: serverSelectionTimeoutMS: 10s, socketTimeoutMS: 20s

## 🛡️ Security Features

### Immutability
- **SHA256 Digests**: Tamper-evident hashing
- **HMAC Signatures**: Server-side witness signatures
- **Merkle Proofs**: Mathematical inclusion verification
- **Tombstone Deletion**: Append-only, never modifies originals

### Rate Limiting
- **DoS Protection**: Public endpoints limited to 120/min
- **Auth Protection**: Login/register limited to 50/5min
- **Write Protection**: Content creation limited to 30/min

### Input Validation
- **Joi Schemas**: All endpoints validated
- **Content Limits**: 100KB max per entry
- **Email Validation**: RFC-compliant email format

## 🔍 Debugging Tools

### Request Tracking
- **X-HBUK-ReqId**: Unique request identifier
- **X-HBUK-Version**: Build version for debugging
- **X-HBUK-Path**: Request path for correlation

### Log Format
```bash
[REQ <id>] <method> <path> ip=<ip>
[RES <id>] <method> <path> -> <status> in <ms>ms
```

### Common Log Patterns
- **Registration**: `✅ Welcome email sent to <email>`
- **Rate Limits**: `429 Too Many Requests`
- **Validation**: `400 Bad Request` with error details

## 📋 Deployment Checklist

### Pre-Deploy
- [ ] Environment variables set in Render
- [ ] MongoDB Atlas backups enabled
- [ ] Rate limits configured appropriately
- [ ] Health endpoints responding

### Post-Deploy
- [ ] Frontend loads without errors
- [ ] Registration flow works (201 → welcome email)
- [ ] Login flow works (200 → JWT)
- [ ] Commit flow works (201 → receipt download)
- [ ] Verify endpoint works (public access)
- [ ] Proof endpoint works (authenticated)

### Monitoring Setup
- [ ] Uptime monitor configured
- [ ] Atlas alerts enabled
- [ ] Log aggregation working
- [ ] Error tracking configured

## 🆘 Emergency Contacts

### Critical Issues
1. **Database Down**: Check Atlas status + connection strings
2. **Rate Limiting**: Adjust limits temporarily
3. **Secret Compromise**: Rotate all secrets immediately
4. **Performance Issues**: Check connection pools + indexes

### Rollback Procedure
1. **Git Revert**: `git revert <commit-hash>`
2. **Force Deploy**: Push to trigger Render rebuild
3. **Verify Health**: Check all endpoints respond
4. **Monitor Logs**: Watch for any new issues

---

**Last Updated**: 2025-08-12  
**Version**: Production v1.0  
**Maintainer**: Development Team
