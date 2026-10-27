export interface PreviewRow { label: string; value: string; highlight?: boolean }
export interface FeatureCard { icon: string; title: string; desc: string; question: string }

export interface ToolPageConfig {
  category: string;
  headline: string;
  subtitle: string;
  checkmarks: string[];
  inputPlaceholder: string;
  previewCard: {
    title: string;
    subtitle: string;
    badge: string;
    badgeColor: string;
    rows: PreviewRow[];
  };
  features: FeatureCard[];
  quickTry?: string[];
}

export const TOOL_PAGES: Record<string, ToolPageConfig> = {
  "/leads-management/funnel-dashboard": {
    category: "PIPELINE",
    headline: "Visualize your sales pipeline",
    subtitle: "See exactly where your leads stand — stage by stage — and where deals are getting stuck.",
    checkmarks: ["Stage-by-stage count", "Conversion & closing rate", "Funnel drop-off analysis"],
    inputPlaceholder: "Ask about your pipeline or funnel…",
    previewCard: {
      title: "Pipeline Overview",
      subtitle: "All stages · Live CRM data",
      badge: "LIVE",
      badgeColor: "#16a34a",
      rows: [
        { label: "NEW",          value: "Ask AI →" },
        { label: "ASSIGNED",     value: "Ask AI →" },
        { label: "FOLLOWUP",     value: "Ask AI →" },
        { label: "WON",          value: "Ask AI →" },
        { label: "Closing Rate", value: "Ask AI →", highlight: true },
      ],
    },
    features: [
      { icon: "📊", title: "Stage Breakdown",    desc: "Leads in every pipeline stage right now",      question: "How many leads do I have in each stage?" },
      { icon: "🎯", title: "Closing Rate",        desc: "Won ÷ (Won + Lost) conversion metric",         question: "What is my current closing ratio?" },
      { icon: "📉", title: "Funnel Drop-off",     desc: "Where leads are getting stuck or lost",        question: "Why is my conversion rate low?" },
      { icon: "🔍", title: "Funnel Analysis",     desc: "Full AI analysis of your sales funnel",        question: "Analyze my sales funnel and tell me what I should focus on" },
    ],
    quickTry: ["How many leads are in NEW?", "How many leads did I win this month?"],
  },

  "/leads-management/call-later": {
    category: "FOLLOW-UPS",
    headline: "Never miss a follow-up",
    subtitle: "Track all leads scheduled for follow-up, see which are overdue, and get AI advice on how to close them.",
    checkmarks: ["Follow-up lead count", "Overdue & stale leads", "AI closing tips"],
    inputPlaceholder: "Ask about follow-up leads…",
    previewCard: {
      title: "Follow-up Tracker",
      subtitle: "Active follow-up leads",
      badge: "FOLLOWUP",
      badgeColor: "#d97706",
      rows: [
        { label: "In FOLLOWUP",    value: "Ask AI →" },
        { label: "Stale (8+ days)", value: "Ask AI →" },
        { label: "Added today",    value: "Ask AI →" },
        { label: "Avg. age",       value: "Ask AI →", highlight: true },
      ],
    },
    features: [
      { icon: "🔔", title: "Follow-up Count",  desc: "Total leads in follow-up stage",          question: "How many leads are in follow-up?" },
      { icon: "⏰", title: "Stale Leads",       desc: "Active leads with no recent activity",    question: "Which leads are stuck in follow-up for more than 7 days?" },
      { icon: "📅", title: "Today's Follow-ups",desc: "Leads added or moved to follow-up today", question: "Show me today's leads in follow-up" },
      { icon: "💡", title: "Closing Tips",      desc: "AI advice on converting follow-up leads", question: "How do I convert more follow-up leads to won?" },
    ],
    quickTry: ["How many leads are in follow-up?", "Why are leads stuck in follow-up?"],
  },

  "/leads-management/actvities": {
    category: "ACTIVITIES",
    headline: "Track your team's activities",
    subtitle: "See pending follow-ups, overdue demos & visits, and upcoming activities — with AI advice on improving conversion.",
    checkmarks: ["Activity counts by type & status", "Upcoming & overdue activities", "Salesperson performance"],
    inputPlaceholder: "Ask about follow-ups, demos, visits, or salesperson activity…",
    previewCard: {
      title: "Activity Summary",
      subtitle: "Team activities · Live data",
      badge: "ACTIVE",
      badgeColor: "#1677ff",
      rows: [
        { label: "Pending follow-ups",   value: "Ask AI →" },
        { label: "Upcoming (7 days)",    value: "Ask AI →" },
        { label: "Overdue activities",   value: "Ask AI →" },
        { label: "Top closer",           value: "Ask AI →", highlight: true },
      ],
    },
    features: [
      { icon: "🔔", title: "Activity Summary",    desc: "Follow-ups, demos, visits by type & status", question: "Show me activity counts by type and status" },
      { icon: "⏰", title: "Overdue Activities",  desc: "Activities past their scheduled date",        question: "How many overdue activities are there?" },
      { icon: "📅", title: "Upcoming Schedule",   desc: "Activities coming up in the next 7 days",     question: "How many activities are scheduled in the next 7 days?" },
      { icon: "🏆", title: "Team Performance",    desc: "Won, lost, active leads per salesperson",     question: "Show me salesperson performance" },
    ],
    quickTry: ["How many pending follow-ups are there?", "Show me overdue activities"],
  },

  "/leads-management/repeated-enquiries": {
    category: "REPEATED ENQUIRIES",
    headline: "Spot duplicate & repeated leads",
    subtitle: "Identify customers who have enquired more than once, track their journey, and close them faster.",
    checkmarks: ["Repeated enquiry count", "Lead history per customer", "Stage-wise follow-up"],
    inputPlaceholder: "Ask about repeated leads or duplicate enquiries…",
    previewCard: {
      title: "Repeated Enquiry Tracker",
      subtitle: "Multiple enquiries · Same customer",
      badge: "REVIEW",
      badgeColor: "#7c3aed",
      rows: [
        { label: "Total leads",      value: "Ask AI →" },
        { label: "In follow-up",     value: "Ask AI →" },
        { label: "Won",              value: "Ask AI →" },
        { label: "Conversion rate",  value: "Ask AI →", highlight: true },
      ],
    },
    features: [
      { icon: "🔁", title: "Repeated Count",   desc: "How many repeated enquiries exist",       question: "How many repeated enquiries do I have?" },
      { icon: "📋", title: "Stage Overview",   desc: "Repeated leads by pipeline stage",        question: "How many repeated enquiry leads are in each stage?" },
      { icon: "🎯", title: "Win Strategy",     desc: "How to close repeated enquiry leads",     question: "How should I handle repeated enquiry leads?" },
      { icon: "📅", title: "Recent Enquiries", desc: "Repeated leads added recently",           question: "Show me today's repeated enquiries" },
    ],
  },

  "/leads-management/ringing": {
    category: "RINGING LEADS",
    headline: "Track ringing & unanswered leads",
    subtitle: "See how many leads are in the ringing state, which ones need urgent follow-up, and get calling tips.",
    checkmarks: ["Ringing lead count", "Unanswered follow-up alerts", "Calling best practices"],
    inputPlaceholder: "Ask about ringing or unanswered leads…",
    previewCard: {
      title: "Ringing Lead Status",
      subtitle: "Needs callback",
      badge: "RINGING",
      badgeColor: "#dc2626",
      rows: [
        { label: "Ringing / Unanswered", value: "Ask AI →" },
        { label: "Follow-up stage",      value: "Ask AI →" },
        { label: "Won",                  value: "Ask AI →" },
        { label: "Needs callback",       value: "Ask AI →", highlight: true },
      ],
    },
    features: [
      { icon: "📞", title: "Ringing Count",  desc: "Total leads currently in ringing state",   question: "How many ringing leads do I have?" },
      { icon: "⚡", title: "Urgent Leads",   desc: "Leads that urgently need a callback",       question: "Which leads need urgent follow-up?" },
      { icon: "💡", title: "Calling Tips",   desc: "AI advice on handling unanswered calls",   question: "Give me tips on handling leads that don't answer calls" },
      { icon: "📊", title: "Stage View",     desc: "Ringing leads across all stages",          question: "Show me all leads in the ringing stage" },
    ],
  },

  "/leads-management": {
    category: "LEADS",
    headline: "Find & analyze any lead",
    subtitle: "Know exactly where your leads stand — search by name, stage, or date, and get instant AI insights.",
    checkmarks: ["Stage breakdown & counts", "Lead ageing & stale alerts", "Conversion & closing rates"],
    inputPlaceholder: "Search by name, business, stage, or ask anything about your leads…",
    previewCard: {
      title: "Lead Intelligence",
      subtitle: "Your CRM · Live data",
      badge: "ACTIVE",
      badgeColor: "#16a34a",
      rows: [
        { label: "Total leads",      value: "Ask AI →" },
        { label: "In follow-up",     value: "Ask AI →" },
        { label: "Won this month",   value: "Ask AI →" },
        { label: "Conversion rate",  value: "Ask AI →", highlight: true },
      ],
    },
    features: [
      { icon: "📊", title: "Stage Breakdown",   desc: "Count of leads in every pipeline stage",     question: "How many leads do I have in each stage?" },
      { icon: "📅", title: "Today's Leads",      desc: "New leads added to your CRM today",          question: "Show me today's leads" },
      { icon: "⏰", title: "Stale Leads",        desc: "Active leads with no recent follow-up",      question: "Show me leads that have been in follow-up for more than 7 days" },
      { icon: "🏆", title: "Team Performance",   desc: "Won, lost, and active per salesperson",      question: "Show me salesperson performance" },
    ],
    quickTry: ["How many leads do I have?", "Which leads are in follow-up?", "Show yesterday's leads"],
  },

  "/reports/source-wise": {
    category: "ANALYTICS",
    headline: "Lead source analysis",
    subtitle: "Discover which channels — JustDial, Google Ads, Website — bring the most and best-converting leads.",
    checkmarks: ["Source-wise lead count", "Conversion rate per channel", "Best & worst performing sources"],
    inputPlaceholder: "Ask about lead sources or channel performance…",
    previewCard: {
      title: "Source Performance",
      subtitle: "All channels · Lead data",
      badge: "REPORT",
      badgeColor: "#1677ff",
      rows: [
        { label: "Top source",       value: "Ask AI →" },
        { label: "Total sources",    value: "Ask AI →" },
        { label: "Best conversion",  value: "Ask AI →", highlight: true },
        { label: "Lowest ROI",       value: "Ask AI →" },
      ],
    },
    features: [
      { icon: "📊", title: "Source Breakdown",  desc: "Leads and conversion rate per channel",      question: "Show me the lead source breakdown and conversion rates" },
      { icon: "🏆", title: "Best Channel",      desc: "Which source gives you the most leads",       question: "Which lead source brings the most leads?" },
      { icon: "🎯", title: "Best Converter",    desc: "Which channel has the highest win rate",      question: "Which lead source has the best conversion rate?" },
      { icon: "💡", title: "Source Advice",     desc: "Where to focus your marketing investment",   question: "Based on my lead sources, where should I focus my marketing?" },
    ],
  },

  "/reports/employee-wise": {
    category: "TEAM PERFORMANCE",
    headline: "Know how your team is performing",
    subtitle: "See which salesperson is closing the most deals, who needs support, and where performance gaps are.",
    checkmarks: ["Per-salesperson won/lost", "Closing rate comparison", "AI coaching suggestions"],
    inputPlaceholder: "Ask about team or salesperson performance…",
    previewCard: {
      title: "Team Performance",
      subtitle: "Salesperson comparison",
      badge: "RANKED",
      badgeColor: "#7c3aed",
      rows: [
        { label: "Top performer",    value: "Ask AI →" },
        { label: "Best closing rate", value: "Ask AI →", highlight: true },
        { label: "Most active",      value: "Ask AI →" },
        { label: "Needs support",    value: "Ask AI →" },
      ],
    },
    features: [
      { icon: "🏆", title: "Leaderboard",         desc: "Who is closing the most deals",             question: "Show me salesperson performance ranked by won deals" },
      { icon: "🎯", title: "Closing Rates",        desc: "Closing ratio per salesperson",             question: "Which salesperson has the best closing rate?" },
      { icon: "📊", title: "Active Pipeline",      desc: "Active leads per team member right now",    question: "How many active leads does each salesperson have?" },
      { icon: "💡", title: "Coaching Tips",        desc: "AI advice to improve team performance",     question: "How can I help my team close more deals?" },
    ],
  },

  "/reports/city-wise": {
    category: "SALES ANALYTICS",
    headline: "Sales analytics by city & state",
    subtitle: "See where your strongest markets are, which cities convert best, and where to expand your focus.",
    checkmarks: ["City & state-wise counts", "Geographic conversion rates", "Growth opportunity mapping"],
    inputPlaceholder: "Ask about city, state, or geographic sales performance…",
    previewCard: {
      title: "Geographic Sales",
      subtitle: "City & state breakdown",
      badge: "GEO",
      badgeColor: "#0891b2",
      rows: [
        { label: "Top city",        value: "Ask AI →" },
        { label: "Total cities",    value: "Ask AI →" },
        { label: "Best converting", value: "Ask AI →", highlight: true },
        { label: "Lowest won",      value: "Ask AI →" },
      ],
    },
    features: [
      { icon: "📍", title: "City Breakdown",    desc: "Leads and wins by city",                     question: "Show me leads by city" },
      { icon: "🗺️",  title: "State Overview",   desc: "Leads and conversion by state",              question: "Show me leads by state" },
      { icon: "🎯",  title: "Best Market",      desc: "Which city converts the most leads",          question: "Which city has the most won leads?" },
      { icon: "💡",  title: "Market Strategy",  desc: "Where to focus for maximum sales growth",     question: "Which geography should I focus on to increase sales?" },
    ],
  },

  "/reports/call-logs-report": {
    category: "CALL LOGS",
    headline: "Call strategy & lead follow-up",
    subtitle: "Call log records are in your report table. Use AI to get calling best practices, follow-up scripts, and check your CRM pipeline.",
    checkmarks: ["Calling scripts & best practices", "Ringing & unanswered lead data", "CRM pipeline overview"],
    inputPlaceholder: "Ask for calling tips, scripts, or check your lead pipeline…",
    previewCard: {
      title: "Ringing Leads",
      subtitle: "Lead data available from here",
      badge: "CRM",
      badgeColor: "#dc2626",
      rows: [
        { label: "In FOLLOWUP",      value: "Ask AI →" },
        { label: "Stale leads",      value: "Ask AI →" },
        { label: "Total pipeline",   value: "Ask AI →" },
        { label: "Closing rate",     value: "Ask AI →", highlight: true },
      ],
    },
    features: [
      { icon: "💬", title: "Call Scripts",      desc: "Effective scripts for first-call lead contact",  question: "Give me a script for the first call with a new lead" },
      { icon: "🔔", title: "Unanswered Leads",  desc: "CRM leads not responding to calls",             question: "Which leads have been in follow-up for more than 7 days?" },
      { icon: "💡", title: "Calling Tips",      desc: "Best time and approach for sales calls",        question: "Give me tips for following up leads by phone" },
      { icon: "📊", title: "Pipeline Check",    desc: "Where your leads stand in the CRM right now",   question: "How many leads do I have in each stage?" },
    ],
    quickTry: ["Give me a follow-up call script", "Show me stale leads that need a call"],
  },

  "/sales-targeting": {
    category: "EMPLOYEE TARGETS",
    headline: "Target setting & performance advice",
    subtitle: "Target records are tracked in your targeting module. Use AI to get advice on setting fair targets and check real CRM performance data.",
    checkmarks: ["Target-setting best practices", "Real CRM won/lost data", "Performance coaching advice"],
    inputPlaceholder: "Ask for target advice or check actual sales performance…",
    previewCard: {
      title: "Sales Performance",
      subtitle: "CRM data available from here",
      badge: "CRM",
      badgeColor: "#2563eb",
      rows: [
        { label: "Won this month",   value: "Ask AI →" },
        { label: "Best closer",      value: "Ask AI →" },
        { label: "Closing rate",     value: "Ask AI →", highlight: true },
        { label: "Total pipeline",   value: "Ask AI →" },
      ],
    },
    features: [
      { icon: "🎯", title: "Target Setting",    desc: "How to set fair and motivating sales targets",  question: "How should I set monthly sales targets for my team?" },
      { icon: "🏆", title: "Top Performers",    desc: "Who has the highest won deals in your CRM",    question: "Who has the most won leads?" },
      { icon: "📊", title: "Closing Rates",     desc: "Actual conversion rate per salesperson",        question: "Which salesperson has the best closing rate?" },
      { icon: "💡", title: "Gap Coaching",      desc: "How to help underperforming team members",     question: "How can I help my team close more deals?" },
    ],
    quickTry: ["Who is closing the most deals?", "How should I set sales targets?"],
  },

  "/tasks": {
    category: "TASKS",
    headline: "Track tasks & manage your team",
    subtitle: "Check open, overdue, and pending tasks — see who has the most open work, and get AI advice on prioritizing for more closings.",
    checkmarks: ["Open & overdue task counts", "Tasks by assignee", "Task prioritization advice"],
    inputPlaceholder: "Ask about your tasks, or ask how to manage them better…",
    previewCard: {
      title: "Task Summary",
      subtitle: "Your CRM tasks · Live data",
      badge: "TASKS",
      badgeColor: "#f59e0b",
      rows: [
        { label: "Open tasks",       value: "Ask AI →" },
        { label: "Overdue tasks",    value: "Ask AI →" },
        { label: "In progress",      value: "Ask AI →" },
        { label: "Completed",        value: "Ask AI →", highlight: true },
      ],
    },
    features: [
      { icon: "📋", title: "Task Overview",     desc: "Open, overdue, and completed task counts",    question: "How many open tasks do I have?" },
      { icon: "⚠️", title: "Overdue Tasks",     desc: "Tasks that are past their due date",          question: "How many overdue tasks are there?" },
      { icon: "👤", title: "By Assignee",       desc: "Who has the most open tasks on your team",    question: "Show me tasks by assignee" },
      { icon: "💡", title: "Prioritization",    desc: "AI advice on closing tasks to win more deals", question: "How should I prioritize my sales tasks to close more deals?" },
    ],
    quickTry: ["How many open tasks do I have?", "How many overdue tasks are there?"],
  },

  "/dashboard": {
    category: "DASHBOARD",
    headline: "Your CRM, explained by AI",
    subtitle: "Ask anything about your leads, pipeline, team performance, or get expert sales advice — powered by live data.",
    checkmarks: ["Live lead counts & stages", "Conversion & closing rates", "Team & source analysis"],
    inputPlaceholder: "Ask anything about your CRM…",
    previewCard: {
      title: "CRM Snapshot",
      subtitle: "Your business · Live data",
      badge: "LIVE",
      badgeColor: "#16a34a",
      rows: [
        { label: "Total leads",     value: "Ask AI →" },
        { label: "In pipeline",     value: "Ask AI →" },
        { label: "Won this month",  value: "Ask AI →" },
        { label: "Closing rate",    value: "Ask AI →", highlight: true },
      ],
    },
    features: [
      { icon: "📊", title: "Lead Overview",    desc: "Stage breakdown of all your leads",          question: "How many leads do I have in each stage?" },
      { icon: "📅", title: "Today's Activity", desc: "What happened in your CRM today",            question: "Show me today's leads" },
      { icon: "🏆", title: "Team Performance", desc: "Who is closing the most deals",              question: "Show me salesperson performance" },
      { icon: "💡", title: "Sales Advice",     desc: "Expert tips to improve your pipeline",       question: "How can I improve my closing rate?" },
    ],
    quickTry: ["How many leads do I have?", "What's my conversion rate?", "Analyze my sales funnel"],
  },

  "/attendance": {
    category: "ATTENDANCE",
    headline: "Attendance & team activity",
    subtitle: "Ask about your team's attendance, leave patterns, or get advice on managing field and office staff.",
    checkmarks: ["Team attendance patterns", "Leave & absence insights", "Field team management tips"],
    inputPlaceholder: "Ask about attendance, leave, or team management…",
    previewCard: {
      title: "Sales Pipeline",
      subtitle: "CRM data available from here",
      badge: "CRM",
      badgeColor: "#2563eb",
      rows: [
        { label: "Total leads",      value: "Ask AI →" },
        { label: "In pipeline",      value: "Ask AI →" },
        { label: "Won this month",   value: "Ask AI →" },
        { label: "Team performance", value: "Ask AI →", highlight: true },
      ],
    },
    features: [
      { icon: "💡", title: "Attendance Tips",    desc: "Best practices for managing team attendance",     question: "How can I improve team attendance and punctuality?" },
      { icon: "🏖️", title: "Leave Management",  desc: "Advice on handling leave requests fairly",       question: "What are best practices for managing employee leave?" },
      { icon: "📊", title: "CRM Pipeline",       desc: "Check your leads pipeline from here",            question: "How many leads do I have in each stage?" },
      { icon: "🏆", title: "Team Performance",   desc: "Sales performance of your team",                 question: "Show me salesperson performance" },
    ],
    quickTry: ["How can I manage leave requests better?", "How many leads do I have?"],
  },

  "/salary-master": {
    category: "SALARY",
    headline: "Salary & compensation insights",
    subtitle: "Ask for advice on salary structures, incentives, and how compensation links to sales performance.",
    checkmarks: ["Compensation strategy advice", "Sales incentive planning", "CRM performance data"],
    inputPlaceholder: "Ask about salary, incentives, or sales performance…",
    previewCard: {
      title: "Sales Performance",
      subtitle: "CRM data available from here",
      badge: "CRM",
      badgeColor: "#2563eb",
      rows: [
        { label: "Top performer",    value: "Ask AI →" },
        { label: "Closing rate",     value: "Ask AI →" },
        { label: "Won this month",   value: "Ask AI →", highlight: true },
        { label: "Total leads",      value: "Ask AI →" },
      ],
    },
    features: [
      { icon: "💰", title: "Incentive Design",   desc: "How to structure sales incentive plans",          question: "How should I design a sales incentive plan?" },
      { icon: "🏆", title: "Top Performers",     desc: "Who is closing the most deals in your team",     question: "Who has the most won leads?" },
      { icon: "📊", title: "Team Analytics",     desc: "Salesperson performance from CRM data",          question: "Show me salesperson performance" },
      { icon: "💡", title: "Retention Tips",     desc: "How to retain high-performing sales staff",      question: "How can I retain my best salespeople?" },
    ],
  },

  "/payroll": {
    category: "PAYROLL",
    headline: "Payroll & performance",
    subtitle: "Ask for advice on linking payroll to performance, managing payroll cycles, or check your team's CRM stats.",
    checkmarks: ["Performance-linked pay advice", "Payroll cycle management", "CRM sales data"],
    inputPlaceholder: "Ask about payroll, performance pay, or team stats…",
    previewCard: {
      title: "Team Sales",
      subtitle: "CRM data available from here",
      badge: "CRM",
      badgeColor: "#2563eb",
      rows: [
        { label: "Won deals",        value: "Ask AI →" },
        { label: "Closing rate",     value: "Ask AI →", highlight: true },
        { label: "Total pipeline",   value: "Ask AI →" },
        { label: "Top closer",       value: "Ask AI →" },
      ],
    },
    features: [
      { icon: "💡", title: "Performance Pay",    desc: "Link payroll to individual sales results",       question: "How should I structure performance-based pay?" },
      { icon: "🏆", title: "Best Performers",    desc: "Who earned the most deals this month",           question: "Show me salesperson performance" },
      { icon: "📊", title: "Closing Stats",      desc: "Closing rate per salesperson",                   question: "Which salesperson has the best closing rate?" },
      { icon: "🎯", title: "Target Advice",      desc: "How to set fair sales targets",                  question: "How should I set monthly sales targets for my team?" },
    ],
  },

  "/expense-management": {
    category: "EXPENSE",
    headline: "Expense & budget insights",
    subtitle: "Get advice on managing field sales expenses, budget allocation, and linking spend to lead conversion.",
    checkmarks: ["Expense approval advice", "Budget vs performance", "CRM lead & conversion data"],
    inputPlaceholder: "Ask about expenses, budgets, or sales ROI…",
    previewCard: {
      title: "Lead ROI View",
      subtitle: "CRM data available from here",
      badge: "CRM",
      badgeColor: "#2563eb",
      rows: [
        { label: "Lead sources",     value: "Ask AI →" },
        { label: "Won this month",   value: "Ask AI →" },
        { label: "Conversion rate",  value: "Ask AI →", highlight: true },
        { label: "Total leads",      value: "Ask AI →" },
      ],
    },
    features: [
      { icon: "💡", title: "Expense Policy",     desc: "Best practices for field sales expense rules",   question: "What should be in a field sales expense policy?" },
      { icon: "📊", title: "Lead ROI",           desc: "Which source brings the best ROI",               question: "Which lead source has the best conversion rate?" },
      { icon: "🎯", title: "Budget Advice",      desc: "How to allocate budget across channels",         question: "How should I allocate marketing budget across lead sources?" },
      { icon: "🏆", title: "Team Performance",   desc: "Who is generating the most won deals",           question: "Show me salesperson performance" },
    ],
  },

  "/events": {
    category: "EVENTS",
    headline: "Events & lead generation",
    subtitle: "Ask how to turn event attendees into CRM leads, track event pipeline performance, and improve conversions.",
    checkmarks: ["Event-to-lead conversion tips", "Event pipeline tracking", "CRM data & follow-up advice"],
    inputPlaceholder: "Ask about events, lead generation, or follow-up strategy…",
    previewCard: {
      title: "Lead Pipeline",
      subtitle: "CRM data available from here",
      badge: "CRM",
      badgeColor: "#2563eb",
      rows: [
        { label: "Total leads",      value: "Ask AI →" },
        { label: "NEW leads",        value: "Ask AI →" },
        { label: "Follow-up",        value: "Ask AI →" },
        { label: "Won this month",   value: "Ask AI →", highlight: true },
      ],
    },
    features: [
      { icon: "🎪", title: "Event Strategy",     desc: "How to generate more leads from events",        question: "How can I generate more leads from events and trade shows?" },
      { icon: "🔔", title: "Follow-up Tips",     desc: "How to follow up with event leads fast",        question: "What is the best way to follow up with event leads?" },
      { icon: "📊", title: "Pipeline Overview",  desc: "Current leads by stage in your CRM",            question: "How many leads do I have in each stage?" },
      { icon: "💡", title: "Conversion Advice",  desc: "Turn event attendees into closed deals",        question: "How can I convert more event leads to won deals?" },
    ],
  },

  "/whatsapp": {
    category: "WHATSAPP",
    headline: "WhatsApp & lead engagement",
    subtitle: "Ask how to use WhatsApp to follow up on leads, automate messages, and increase your conversion rate.",
    checkmarks: ["WhatsApp follow-up strategy", "Message timing & templates", "Lead conversion via chat"],
    inputPlaceholder: "Ask about WhatsApp strategy, follow-up, or lead data…",
    previewCard: {
      title: "Follow-up Leads",
      subtitle: "CRM data available from here",
      badge: "CRM",
      badgeColor: "#16a34a",
      rows: [
        { label: "In FOLLOWUP",      value: "Ask AI →" },
        { label: "Stale leads",      value: "Ask AI →" },
        { label: "Added today",      value: "Ask AI →" },
        { label: "Conversion rate",  value: "Ask AI →", highlight: true },
      ],
    },
    features: [
      { icon: "💬", title: "Message Templates",  desc: "Best WhatsApp templates for follow-up",         question: "Give me WhatsApp message templates for following up on leads" },
      { icon: "⏰", title: "Best Timing",        desc: "When to send WhatsApp follow-ups",               question: "What is the best time to send WhatsApp follow-ups to leads?" },
      { icon: "📊", title: "Follow-up Leads",    desc: "Leads currently in follow-up stage",             question: "How many leads are in follow-up?" },
      { icon: "💡", title: "Automation Tips",    desc: "How to automate WhatsApp lead nurturing",        question: "How can I automate WhatsApp follow-ups for my leads?" },
    ],
    quickTry: ["How many leads are in follow-up?", "Give me a WhatsApp follow-up template"],
  },

  "/ai-contact-genrator": {
    category: "AI CONTACTS",
    headline: "Generate & discover new leads",
    subtitle: "Ask for advice on lead generation strategies, target audience research, and how to build your pipeline.",
    checkmarks: ["Lead generation strategies", "Target audience insights", "Pipeline building advice"],
    inputPlaceholder: "Ask about lead generation, target markets, or pipeline building…",
    previewCard: {
      title: "Pipeline Health",
      subtitle: "CRM data available from here",
      badge: "CRM",
      badgeColor: "#2563eb",
      rows: [
        { label: "Total leads",      value: "Ask AI →" },
        { label: "NEW leads",        value: "Ask AI →" },
        { label: "Best source",      value: "Ask AI →" },
        { label: "Conversion rate",  value: "Ask AI →", highlight: true },
      ],
    },
    features: [
      { icon: "🎯", title: "Target Audience",    desc: "How to identify and reach your ideal customers", question: "How do I find my ideal target audience for lead generation?" },
      { icon: "📊", title: "Source Analysis",    desc: "Which channels bring your best leads",           question: "Show me the lead source breakdown and conversion rates" },
      { icon: "💡", title: "Pipeline Strategy",  desc: "How to consistently fill your CRM pipeline",     question: "How can I build a consistent lead generation pipeline?" },
      { icon: "🔍", title: "Current Pipeline",   desc: "Where your existing leads stand right now",      question: "How many leads do I have in each stage?" },
    ],
  },

  "/user-tracking": {
    category: "FIELD TRACKING",
    headline: "Field team tracking & insights",
    subtitle: "Monitor field team activity, track visit patterns, and get advice on improving field sales productivity.",
    checkmarks: ["Field activity insights", "Visit frequency advice", "CRM lead follow-up data"],
    inputPlaceholder: "Ask about field team activity, visits, or lead follow-up…",
    previewCard: {
      title: "Team Activity",
      subtitle: "CRM data available from here",
      badge: "CRM",
      badgeColor: "#2563eb",
      rows: [
        { label: "Active leads",     value: "Ask AI →" },
        { label: "Follow-up stage",  value: "Ask AI →" },
        { label: "Stale leads",      value: "Ask AI →" },
        { label: "Team performance", value: "Ask AI →", highlight: true },
      ],
    },
    features: [
      { icon: "🗺️",  title: "Field Strategy",   desc: "Best practices for managing a field sales team", question: "What are best practices for managing a field sales team?" },
      { icon: "🏆", title: "Top Performers",     desc: "Who is visiting the most leads",                 question: "Show me salesperson performance" },
      { icon: "⏰", title: "Stale Leads",        desc: "Leads with no recent follow-up",                question: "Show me leads that have been in follow-up for more than 7 days" },
      { icon: "💡", title: "Visit Tips",         desc: "How to improve field visit conversion rate",    question: "How can I improve conversion from field visits?" },
    ],
  },

  "/attendance/holiday-calendar": {
    category: "HOLIDAY CALENDAR",
    headline: "Holiday management & planning",
    subtitle: "Manage your outlet's holiday list and get advice on structuring paid leave and public holiday policies.",
    checkmarks: ["Holiday policy advice", "Paid vs optional holiday guidance", "CRM pipeline check"],
    inputPlaceholder: "Ask about holiday policies or check your CRM data…",
    previewCard: {
      title: "CRM Pipeline",
      subtitle: "CRM data available from here",
      badge: "CRM",
      badgeColor: "#2563eb",
      rows: [
        { label: "Total leads",      value: "Ask AI →" },
        { label: "Won this month",   value: "Ask AI →" },
        { label: "Team performance", value: "Ask AI →" },
        { label: "Closing rate",     value: "Ask AI →", highlight: true },
      ],
    },
    features: [
      { icon: "🎉", title: "Holiday Policy",     desc: "Best practices for setting paid public holidays",  question: "How many paid holidays should a company offer per year?" },
      { icon: "💡", title: "Optional Holidays",  desc: "How to handle optional and regional holidays",    question: "How should I manage optional and regional holidays for my team?" },
      { icon: "📊", title: "CRM Pipeline",       desc: "Check your current lead pipeline",                question: "How many leads do I have in each stage?" },
      { icon: "🏆", title: "Team Performance",   desc: "Salesperson performance from CRM",                question: "Show me salesperson performance" },
    ],
  },

  "/attendance/leave-management": {
    category: "LEAVE MANAGEMENT",
    headline: "Leave approvals & team management",
    subtitle: "Manage leave requests, review approvals, and get AI advice on handling leave fairly across your sales team.",
    checkmarks: ["Leave approval best practices", "Fair leave policy advice", "CRM performance data"],
    inputPlaceholder: "Ask about leave approvals, policies, or team performance…",
    previewCard: {
      title: "Sales Pipeline",
      subtitle: "CRM data available from here",
      badge: "CRM",
      badgeColor: "#2563eb",
      rows: [
        { label: "Total leads",      value: "Ask AI →" },
        { label: "Active pipeline",  value: "Ask AI →" },
        { label: "Won this month",   value: "Ask AI →" },
        { label: "Team performance", value: "Ask AI →", highlight: true },
      ],
    },
    features: [
      { icon: "✅", title: "Approval Tips",      desc: "Best practices for reviewing leave requests",     question: "What are best practices for approving or rejecting leave requests?" },
      { icon: "⚖️", title: "Fair Leave Policy",  desc: "How to set up a fair leave policy for sales teams", question: "How should I structure a leave policy for a sales team?" },
      { icon: "📊", title: "CRM Pipeline",       desc: "Check team leads and performance",                question: "How many leads do I have in each stage?" },
      { icon: "🏆", title: "Team Performance",   desc: "Who is performing best in your CRM",              question: "Show me salesperson performance" },
    ],
  },

  "/attendance/apply-leave": {
    category: "APPLY LEAVE",
    headline: "Leave requests & planning",
    subtitle: "Submit leave requests and get advice on planning time off without impacting your sales pipeline.",
    checkmarks: ["Leave planning advice", "Pipeline check before leave", "Handover tips"],
    inputPlaceholder: "Ask about leave planning or check your CRM before going on leave…",
    previewCard: {
      title: "Pipeline Before Leave",
      subtitle: "CRM data available from here",
      badge: "CRM",
      badgeColor: "#2563eb",
      rows: [
        { label: "Active leads",     value: "Ask AI →" },
        { label: "Follow-ups due",   value: "Ask AI →" },
        { label: "Overdue tasks",    value: "Ask AI →" },
        { label: "Stale leads",      value: "Ask AI →", highlight: true },
      ],
    },
    features: [
      { icon: "📋", title: "Pipeline Check",     desc: "Review your leads before going on leave",         question: "How many leads are in follow-up right now?" },
      { icon: "🔔", title: "Overdue Tasks",      desc: "Tasks that need attention before you leave",      question: "How many overdue tasks do I have?" },
      { icon: "💡", title: "Handover Tips",      desc: "How to hand over leads before going on leave",    question: "How should I hand over my leads before going on leave?" },
      { icon: "⏰", title: "Stale Leads",        desc: "Leads that need a follow-up before you leave",    question: "Show me leads that have been in follow-up for more than 7 days" },
    ],
    quickTry: ["How many leads need follow-up?", "How many overdue tasks do I have?"],
  },

  "/attendance/leave-balance": {
    category: "LEAVE BALANCE",
    headline: "Leave balance & team insights",
    subtitle: "Check leave balances and get advice on managing leave allocation fairly across your sales team.",
    checkmarks: ["Leave balance guidance", "Fair allocation advice", "CRM performance data"],
    inputPlaceholder: "Ask about leave balances or team performance…",
    previewCard: {
      title: "Team Performance",
      subtitle: "CRM data available from here",
      badge: "CRM",
      badgeColor: "#2563eb",
      rows: [
        { label: "Top performer",    value: "Ask AI →" },
        { label: "Won this month",   value: "Ask AI →" },
        { label: "Closing rate",     value: "Ask AI →", highlight: true },
        { label: "Total leads",      value: "Ask AI →" },
      ],
    },
    features: [
      { icon: "⚖️", title: "Fair Allocation",    desc: "How to allocate leave days fairly across teams",  question: "How should I allocate annual leave days for a sales team?" },
      { icon: "💡", title: "Leave Policy Tips",  desc: "Best practices for managing leave balances",     question: "What are best practices for managing employee leave balances?" },
      { icon: "🏆", title: "Top Performers",     desc: "Who is closing the most deals right now",        question: "Show me salesperson performance" },
      { icon: "📊", title: "Pipeline Check",     desc: "Current state of your CRM leads",                question: "How many leads do I have in each stage?" },
    ],
  },

  "/sales-orders": {
    category: "SALES ORDERS",
    headline: "Sales orders & deal tracking",
    subtitle: "Track your sales orders and use AI to analyse deal velocity, team performance, and pipeline health.",
    checkmarks: ["Deal pipeline analysis", "Team closing performance", "Source & conversion insights"],
    inputPlaceholder: "Ask about deals, pipeline, or team performance…",
    previewCard: {
      title: "Deal Pipeline",
      subtitle: "CRM data available from here",
      badge: "CRM",
      badgeColor: "#2563eb",
      rows: [
        { label: "Won deals",        value: "Ask AI →" },
        { label: "Active pipeline",  value: "Ask AI →" },
        { label: "Closing rate",     value: "Ask AI →", highlight: true },
        { label: "Top closer",       value: "Ask AI →" },
      ],
    },
    features: [
      { icon: "🏆", title: "Top Closers",        desc: "Who is winning the most deals in your CRM",     question: "Who has the most won leads?" },
      { icon: "📊", title: "Pipeline Overview",  desc: "Stage-by-stage count of all active leads",      question: "How many leads do I have in each stage?" },
      { icon: "🎯", title: "Closing Rate",        desc: "Your team's overall closing performance",        question: "What is my current closing ratio?" },
      { icon: "💡", title: "Deal Advice",         desc: "How to accelerate deal closings",               question: "How can I close more deals faster?" },
    ],
    quickTry: ["Who has the most won deals?", "What is my closing ratio?"],
  },

  "/export-operations": {
    category: "EXPORT OPERATIONS",
    headline: "Export pipeline & performance",
    subtitle: "Use AI to analyse your export sales pipeline, track deal conversion, and get advice on growing your export business.",
    checkmarks: ["Export pipeline analysis", "Conversion & closing data", "Market & source insights"],
    inputPlaceholder: "Ask about your export pipeline, deals, or team performance…",
    previewCard: {
      title: "Export Pipeline",
      subtitle: "CRM data available from here",
      badge: "CRM",
      badgeColor: "#2563eb",
      rows: [
        { label: "Total leads",      value: "Ask AI →" },
        { label: "Active pipeline",  value: "Ask AI →" },
        { label: "Won this month",   value: "Ask AI →" },
        { label: "Closing rate",     value: "Ask AI →", highlight: true },
      ],
    },
    features: [
      { icon: "📊", title: "Pipeline Overview",  desc: "Stage-by-stage breakdown of export leads",      question: "How many leads do I have in each stage?" },
      { icon: "🌍", title: "Market Analysis",    desc: "Which cities or sources bring the best leads",   question: "Show me the lead source breakdown and conversion rates" },
      { icon: "🏆", title: "Team Performance",   desc: "Who is closing the most export deals",           question: "Show me salesperson performance" },
      { icon: "💡", title: "Growth Strategy",    desc: "How to grow your export sales pipeline",         question: "How can I build a consistent lead generation pipeline?" },
    ],
    quickTry: ["How many leads do I have?", "Which lead source converts best?"],
  },
};

export const FALLBACK_CONFIG: ToolPageConfig = {
  category: "CRM ASSISTANT",
  headline: "Ask anything about your business",
  subtitle: "Get instant answers from your CRM data — leads, pipeline, team performance — or ask for expert sales advice.",
  checkmarks: ["Live CRM data & lead counts", "Team & conversion analytics", "Expert sales advice"],
  inputPlaceholder: "Ask anything about your CRM data or sales strategy…",
  previewCard: {
    title: "CRM Data",
    subtitle: "Available from any page",
    badge: "LIVE",
    badgeColor: "#16a34a",
    rows: [
      { label: "Total leads",      value: "Ask AI →" },
      { label: "In pipeline",      value: "Ask AI →" },
      { label: "Won this month",   value: "Ask AI →" },
      { label: "Closing rate",     value: "Ask AI →", highlight: true },
    ],
  },
  features: [
    { icon: "📊", title: "Lead Overview",    desc: "Count of leads across all stages",            question: "How many leads do I have in each stage?" },
    { icon: "🏆", title: "Team Performance", desc: "Won, lost, and active per salesperson",       question: "Show me salesperson performance" },
    { icon: "📅", title: "Today's Leads",    desc: "New leads added to CRM today",                question: "Show me today's leads" },
    { icon: "💡", title: "Sales Advice",     desc: "Expert tips to improve your pipeline",        question: "How can I improve my closing rate?" },
  ],
  quickTry: ["How many leads do I have?", "Show me today's leads"],
};

export function getToolConfig(pathname: string): ToolPageConfig {
  const sorted = Object.keys(TOOL_PAGES).sort((a, b) => b.length - a.length);
  const match = sorted.find((prefix) => pathname === prefix || pathname.startsWith(prefix + "/"));
  return match ? TOOL_PAGES[match]! : FALLBACK_CONFIG;
}
