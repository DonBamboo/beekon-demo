# Security Setup Guide

## Critical Security Notice

⚠️ **IMPORTANT**: This application has been secured following a comprehensive security audit. Please follow this guide carefully to maintain security standards.

## Environment Configuration

### Step 1: Create Local Environment File

1. Copy the `.env` file to `.env.local`:
   ```bash
   cp .env .env.local
   ```

2. Update `.env.local` with your actual credentials:
   ```env
   # N8N Configuration
   VITE_N8N_URL="https://your-n8n-instance.com"
   VITE_N8N_WEBHOOK_USER="your-secure-username"
   VITE_N8N_WEBHOOK_PASS="your-secure-password"

   # Supabase Configuration
   VITE_SUPABASE_URL="https://your-project.supabase.co"
   VITE_SUPABASE_PUBLISHABLE_KEY="your-publishable-key"

   # Development flags
   VITE_DEBUG_MODE=false
   ```

### Step 2: Security Best Practices

#### Credential Management
- **Never commit credentials to version control**
- Use strong, unique passwords (minimum 12 characters)
- Consider using environment-specific credentials
- Rotate credentials regularly (every 90 days)

#### N8N Authentication
- **URGENT**: Replace the default credentials immediately
- Use a secure password manager
- Consider implementing OAuth or token-based authentication
- Enable 2FA if available

#### Supabase Configuration
- Use Row Level Security (RLS) policies
- Regularly audit API key usage
- Monitor for unauthorized access attempts
- Keep the Supabase client updated

## Security Headers

The application includes comprehensive security headers configured in two layers:

### Development Server (Vite)
Automatically configured via `vite.config.ts` for development:
- **X-Frame-Options**: Prevents clickjacking
- **X-Content-Type-Options**: Prevents MIME type sniffing
- **X-XSS-Protection**: Browser XSS protection
- **Referrer-Policy**: Controls referrer information
- **Permissions-Policy**: Controls browser feature access

### HTML Meta Tags
Configured in `index.html` for headers that support meta tag delivery:
- **Content Security Policy (CSP)**: Prevents XSS attacks
- **X-Content-Type-Options**: Prevents MIME type sniffing
- **Referrer-Policy**: Controls referrer information
- **Permissions-Policy**: Controls browser feature access

### Production HTTP Headers
**IMPORTANT**: For production deployment, configure these HTTP headers at the web server level:

#### Nginx Configuration
Add to your server block:
```nginx
server {
    # Security Headers
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=()" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-DNS-Prefetch-Control "off" always;
    add_header X-Download-Options "noopen" always;
    
    # Content Security Policy
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://lovable.dev https://*.supabase.co; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https://*.supabase.co https://lovable.dev; connect-src 'self' https://*.supabase.co https://playground.prospana.com wss://*.supabase.co; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests" always;
}
```

#### Apache Configuration
Add to your `.htaccess` or virtual host:
```apache
# Security Headers
Header always set X-Frame-Options "DENY"
Header always set X-Content-Type-Options "nosniff"
Header always set X-XSS-Protection "1; mode=block"
Header always set Referrer-Policy "strict-origin-when-cross-origin"
Header always set Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=()"
Header always set Strict-Transport-Security "max-age=31536000; includeSubDomains"
Header always set X-DNS-Prefetch-Control "off"
Header always set X-Download-Options "noopen"

# Content Security Policy
Header always set Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://lovable.dev https://*.supabase.co; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https://*.supabase.co https://lovable.dev; connect-src 'self' https://*.supabase.co https://playground.prospana.com wss://*.supabase.co; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests"
```

#### Cloudflare/CDN Configuration
If using a CDN, configure these headers in your CDN dashboard or via Transform Rules.

## Input Validation

Enhanced input validation has been implemented:

- Domain validation with protocol enforcement
- HTML sanitization to prevent XSS
- Email format validation
- User input sanitization
- Rate limiting for API calls

## Development vs Production

### Development Mode
```bash
npm run dev
```
- Allows placeholder environment variables (with warnings)
- Source maps enabled
- Console logging enabled
- Relaxed CORS policies

### Production Mode
```bash
npm run build
```
- Requires all environment variables to be properly configured
- Console logging disabled
- Source maps disabled
- Strict security headers enforced

## Security Checklist

### Before Deployment
- [ ] All placeholder credentials replaced
- [ ] Environment variables validated
- [ ] Security headers tested
- [ ] HTTPS enforced
- [ ] CSP policies tested
- [ ] Input validation tested

### Regular Maintenance
- [ ] Review access logs monthly
- [ ] Update dependencies quarterly
- [ ] Rotate credentials quarterly
- [ ] Monitor for security advisories
- [ ] Test backup/recovery procedures

## Incident Response

### If Credentials are Compromised
1. **Immediately** revoke the compromised credentials
2. Generate new credentials
3. Update all environments
4. Review access logs for unauthorized activity
5. Document the incident

### If Security Vulnerability is Found
1. Assess the severity and impact
2. Apply patches immediately for critical issues
3. Test the fixes thoroughly
4. Update this documentation if needed

## Monitoring and Alerting

### Recommended Monitoring
- Failed authentication attempts
- Unusual traffic patterns
- Error rate increases
- Performance degradation

### Supabase Monitoring
- Database connection attempts
- API rate limit violations
- Row Level Security violations
- Unusual query patterns

## Contact Information

For security concerns or incident reporting:
- Review application logs first
- Check Supabase dashboard for backend issues
- Consult the development team for critical issues

## References

- [OWASP Security Guidelines](https://owasp.org/)
- [Supabase Security Documentation](https://supabase.com/docs/guides/auth/security)
- [Vite Security Best Practices](https://vitejs.dev/guide/env-and-mode.html#security-notes)