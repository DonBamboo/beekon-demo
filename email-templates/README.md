# Beekon AI Email Templates

## Overview
This directory contains individual HTML email templates for all user-facing processes in the Beekon AI application. Each template is a complete, standalone HTML email ready for n8n integration.

## Directory Structure

```
email-templates/
├── shared/
│   ├── styles.css              # Common CSS styles for all templates
│   └── README.md              # This documentation
├── website/                    # Website management templates (3 files)
│   ├── onboarding-success.html
│   ├── reanalysis-complete.html
│   └── settings-updated.html
├── analysis/                   # Analysis operation templates (3 files)
│   ├── manual-analysis-complete.html
│   ├── scheduled-analysis-complete.html
│   └── session-complete.html
├── competitor/                 # Competitor management templates (3 files)
│   ├── onboarding-success.html
│   ├── analysis-complete.html
│   └── status-update.html
├── export/                     # Data export templates (2 files)
│   ├── data-export-ready.html
│   └── history-updated.html
├── account/                    # Account management templates (4 files)
│   ├── workspace-created.html
│   ├── profile-updated.html
│   ├── password-changed.html
│   └── avatar-updated.html
├── batch/                      # Batch operation templates (2 files)
│   ├── competitors-added.html
│   └── processing-complete.html
└── system/                     # System operation templates (1 file)
    └── recovery-success.html
```

## Template Categories

### 1. Website Management (3 templates)
- **onboarding-success.html** - Welcome email when a new website is successfully onboarded
- **reanalysis-complete.html** - Notification when website re-analysis is finished
- **settings-updated.html** - Confirmation when website settings are updated

### 2. Analysis Operations (3 templates)
- **manual-analysis-complete.html** - Custom analysis results notification
- **scheduled-analysis-complete.html** - Automated analysis completion
- **session-complete.html** - Comprehensive analysis session results

### 3. Competitor Management (3 templates)
- **onboarding-success.html** - Confirmation when competitors are added
- **analysis-complete.html** - Competitive analysis results ready
- **status-update.html** - Competitor performance change alerts

### 4. Data Export (2 templates)
- **data-export-ready.html** - Export file generation complete
- **history-updated.html** - Export process confirmation

### 5. Account Management (4 templates)
- **workspace-created.html** - New workspace setup confirmation
- **profile-updated.html** - Account information changes
- **password-changed.html** - Security notification for password changes
- **avatar-updated.html** - Profile picture upload success

### 6. Batch Operations (2 templates)
- **competitors-added.html** - Bulk competitor import results
- **processing-complete.html** - Large-scale operation completion

### 7. System Operations (1 template)
- **recovery-success.html** - Failed process recovery notification

## Template Features

### Design Elements
- **Responsive Design**: Mobile-friendly layouts optimized for email clients
- **Beekon AI Branding**: Consistent gradient header with bee emoji logo
- **Professional Styling**: Clean, modern design with proper typography
- **Accessibility**: Proper contrast ratios and fallback text support

### Technical Features
- **Email-Safe CSS**: Inline styles optimized for email client compatibility
- **Handlebars Variables**: Dynamic content placeholders for n8n integration
- **Conditional Content**: Support for success/failure states and error handling
- **Security Elements**: Unsubscribe links and email preferences

## Variable Patterns

### Common Variables (used in most templates)
- `{{user_name}}` - User's display name
- `{{website_domain}}` - Website domain being analyzed
- `{{dashboard_url}}` - Link to main dashboard
- `{{support_url}}` - Support contact link
- `{{docs_url}}` - Documentation link
- `{{unsubscribe_url}}` - Unsubscribe link
- `{{preferences_url}}` - Email preferences link

### Process-Specific Variables
Each template contains specialized variables relevant to its process:
- Analysis results: `{{total_mentions}}`, `{{sentiment_score}}`, `{{ranking_position}}`
- Competitor data: `{{competitors_count}}`, `{{market_position}}`, `{{share_of_voice}}`
- Export information: `{{export_type}}`, `{{file_size}}`, `{{download_url}}`
- Account details: `{{workspace_name}}`, `{{credit_limit}}`, `{{plan_name}}`

## n8n Integration

### Webhook Mapping
Each template corresponds to specific n8n webhook endpoints:
- Website onboarding: `webhook/website-onboarding`
- Re-analysis: `webhook/re-analyze`
- Manual analysis: `webhook/manually-added-analysis`
- Competitor onboarding: `webhook/competitors-onboarding`

### Usage in n8n
1. Reference template file by path: `email-templates/website/onboarding-success.html`
2. Pass variables as JSON object to populate template
3. Send via email service node (SendGrid, Mailgun, etc.)

## Customization Guidelines

### Modifying Templates
- Maintain the existing CSS structure for consistency
- Preserve all Handlebars variable placeholders
- Test changes across multiple email clients
- Keep mobile responsiveness in mind

### Adding New Templates
1. Create new file in appropriate category directory
2. Use existing template as base structure
3. Add specific content and variables for the process
4. Update this README with new template information

## Email Client Compatibility

Templates are tested and optimized for:
- Gmail (Web, iOS, Android)
- Outlook (Web, Desktop, Mobile)
- Apple Mail (macOS, iOS)
- Yahoo Mail
- Mozilla Thunderbird

## File Size Considerations

- Individual templates: ~15-25KB each
- Embedded CSS for email client compatibility
- Optimized for fast loading across networks
- Images use emoji unicode for universal support

## Support

For template issues or customization requests:
- Check existing variable documentation
- Test with sample data before deployment
- Validate HTML structure for email compliance
- Contact development team for major changes