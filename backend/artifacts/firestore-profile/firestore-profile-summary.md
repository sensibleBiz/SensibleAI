# Firestore Production Profile Summary

Generated: 2026-09-15T08:06:20.993Z

## 1. Executive summary

103436 records analyzed across 56 discovered collection types. P0: 1; P1: 25. Read-only profile; no credential values exported.

## 2. Collection inventory

- ACTIVITY
- APP_SETTINGS
- ATTENDANCE
- AUTOLEAD_ASSIGN
- AUTOMATION_RULES
- BUSINESSS_MASTER
- CALL_LOGS
- CATEGORY
- CITIES
- COMPANY_DETAILS
- CONTACTS
- COUNTRIES
- CUSTOMERS
- CUSTOMER_IDENTITIES
- ContactKeyword
- EMPLOYEE_TARGETING
- EVENTS
- EVENT_TRANSACTIONS
- EXPENSE
- EXPENSE_BUDGET
- EXPENSE_HEADER
- FACEBOOK_PAGES
- HOLIDAY
- INTEGRATION
- LEADS_MANAGEMENT
- LEAD_ACTIVITIES
- LEAD_SHARE_TOKENS
- LEAVE_APPLICATION
- LEAVE_BALANCE
- LEAVE_TYPE
- MESSAGING_CONFIG
- MODULE_SUBSCRIPTION
- OUTLET
- PAYROLL
- PERMISSIONS_MASTER
- PRODUCT
- PUBLIC_URLS
- QR_SESSIONS
- QUICK_CONTACTS
- SALARY_MASTER
- SCHEDULE_MESSAGES
- STATE
- STATUS_HISTORY
- TASK_MANAGMENT
- TEAM_TREE
- TRACKING_HISTORY
- TRANSACTIONS
- TRANSFER_REQUEST
- USER_PROFILE
- UserExpenseBalance
- WHATSAPP_MESSAGES
- WHATSAPP_TEMPLATES
- ZONE
- fcm_tokens
- ff_user_push_notifications

Unexpected collections:

- ACTIVITY
- APP_SETTINGS
- AUTOMATION_RULES
- CITIES
- COMPANY_DETAILS
- COUNTRIES
- EMPLOYEE_TARGETING
- EVENTS
- EVENT_TRANSACTIONS
- EXPENSE_HEADER
- FACEBOOK_PAGES
- INTEGRATION
- MESSAGING_CONFIG
- PERMISSIONS_MASTER
- PUBLIC_URLS
- QUICK_CONTACTS
- SCHEDULE_MESSAGES
- STATE
- STATUS_HISTORY
- TASK_MANAGMENT
- TRANSACTIONS
- UserExpenseBalance
- WHATSAPP_TEMPLATES
- ZONE
- fcm_tokens
- ff_user_push_notifications

## 3. Record counts

| Collection | Documents | Drift |
| --- | ---: | --- |
| ACTIVITY | 4 | MAJOR DRIFT |
| APP_SETTINGS | 2 | MINOR DRIFT |
| ATTENDANCE | 3647 | MAJOR DRIFT |
| AUTOLEAD_ASSIGN | 1 | MAJOR DRIFT |
| AUTOMATION_RULES | 7 | MINOR DRIFT |
| BUSINESSS_MASTER | 2 | MINOR DRIFT |
| CALL_LOGS | 55235 | MINOR DRIFT |
| CATEGORY | 3 | MINOR DRIFT |
| CITIES | 879 | MINOR DRIFT |
| COMPANY_DETAILS | 1 | MINOR DRIFT |
| CONTACTS | 421 | MINOR DRIFT |
| COUNTRIES | 232 | MINOR DRIFT |
| CUSTOMERS | 19 | MINOR DRIFT |
| CUSTOMER_IDENTITIES | 37 | MINOR DRIFT |
| ContactKeyword | 6 | MINOR DRIFT |
| EMPLOYEE_TARGETING | 37 | MINOR DRIFT |
| EVENTS | 18 | MINOR DRIFT |
| EVENT_TRANSACTIONS | 13 | MINOR DRIFT |
| EXPENSE | 58 | MAJOR DRIFT |
| EXPENSE_BUDGET | 5 | MINOR DRIFT |
| EXPENSE_HEADER | 15 | MINOR DRIFT |
| FACEBOOK_PAGES | 6 | MINOR DRIFT |
| HOLIDAY | 22 | MINOR DRIFT |
| INTEGRATION | 18 | MINOR DRIFT |
| LEADS_MANAGEMENT | 5932 | BLOCKING DRIFT |
| LEAD_ACTIVITIES | 288 | MAJOR DRIFT |
| LEAD_SHARE_TOKENS | 84 | MINOR DRIFT |
| LEAVE_APPLICATION | 157 | MAJOR DRIFT |
| LEAVE_BALANCE | 42 | MAJOR DRIFT |
| LEAVE_TYPE | 16 | MINOR DRIFT |
| MESSAGING_CONFIG | 2 | MINOR DRIFT |
| MODULE_SUBSCRIPTION | 253 | MINOR DRIFT |
| OUTLET | 12 | MINOR DRIFT |
| PAYROLL | 12 | MAJOR DRIFT |
| PERMISSIONS_MASTER | 58 | MINOR DRIFT |
| PRODUCT | 19 | MINOR DRIFT |
| PUBLIC_URLS | 15 | MAJOR DRIFT |
| QR_SESSIONS | 3372 | MAJOR DRIFT |
| QUICK_CONTACTS | 7 | MINOR DRIFT |
| SALARY_MASTER | 31 | MAJOR DRIFT |
| SCHEDULE_MESSAGES | 528 | MINOR DRIFT |
| SHIFT | 0 | MATCH |
| STATE | 42 | MINOR DRIFT |
| STATUS_HISTORY | 4 | MINOR DRIFT |
| TASK_MANAGMENT | 1 | MINOR DRIFT |
| TEAM_TREE | 63 | MINOR DRIFT |
| TRACKING_HISTORY | 21130 | MINOR DRIFT |
| TRANSACTIONS | 3 | MINOR DRIFT |
| TRANSFER_REQUEST | 2 | MAJOR DRIFT |
| USER_PROFILE | 105 | MAJOR DRIFT |
| UserExpenseBalance | 17 | MAJOR DRIFT |
| WHATSAPP_MESSAGES | 10339 | MINOR DRIFT |
| WHATSAPP_TEMPLATES | 3 | MINOR DRIFT |
| ZONE | 5 | MINOR DRIFT |
| fcm_tokens | 108 | MINOR DRIFT |
| ff_user_push_notifications | 98 | MINOR DRIFT |

## 4. Schema drift

- ACTIVITY: MAJOR DRIFT — unexpected fields: action, actorName, actorUserId, newValue, oldValue, outletId, taskId, timestamp
- APP_SETTINGS: MINOR DRIFT — unexpected fields: deviceId, settingList
- ATTENDANCE: MAJOR DRIFT — mixed types: checkInLocation, checkOutLocation, createdDate; unexpected fields: checkInLocationDetails, checkInSource, checkInTime, checkOutLocationDetails, checkOutSource, checkOutTime, createdDate, dayId, device, dvcIP, dvcId, empCode, employeeCode, id, isPresent, lastUpdatedAt, monthId, note, punchId, source, status, txnInId, txnOutId, userName, yearId
- AUTOLEAD_ASSIGN: MAJOR DRIFT — unexpected fields: adId, createdDate, employeeName, id, integrationId, isActive, modifiedDate, platformName
- AUTOMATION_RULES: MINOR DRIFT — unexpected fields: automationConfigured, buttonText, buttonUrl, buttonUrlExample, category, createdAt, footerText, headerText, id, isActive, languageCode, messageBody, msg91TemplateId, name, outletId, parameterMapping, recipientType, rejectionReason, templateName, templateStatus, triggerEvent, updatedAt
- BUSINESSS_MASTER: MINOR DRIFT — unexpected fields: active, createdBy, createdDate, email, gstin, id, industry, isDemo, legalName, ownerName, pan, phone_number
- CALL_LOGS: MINOR DRIFT — mixed types: deviceId, name, simLabel, simPhoneNumber, subscriptionId; unexpected fields: department, deviceId, durationSeconds, id, name, number, phoneAccountId, receiverMobileNo, receiverName, simLabel, simPhoneNumber, subscriptionId, uploadedAt
- CATEGORY: MINOR DRIFT — unexpected fields: id, isDeleted
- CITIES: MINOR DRIFT — unexpected fields: cityName, code, id, name, state
- COMPANY_DETAILS: MINOR DRIFT — unexpected fields: text
- CONTACTS: MINOR DRIFT — mixed types: Type, address, category, email, eventDateTime, mobile, website; unexpected fields: Type, address, area, assignedAt, assignedEmployeeCode, assignedUserId, assignedUserName, category, city, comments, country, eventDateTime, eventDetails, eventId, eventName, eventReference, eventRegistrationLink, excelRowNumber, fileName, id, importId, reason, region, source, transferedList, uploadName, uploadType, uploadedBy, uploadedDateTime, website, worksheetName
- COUNTRIES: MINOR DRIFT — unexpected fields: countryCode, countryFlag, countryNameCommon, countryNameOfficial, id, isActive
- CUSTOMERS: MINOR DRIFT — unexpected fields: area, businessName, businessType, city, createdDate, customerCode, customerName, id, lifecycle, normalizedBusinessName, normalizedCustomerCode, normalizedCustomerName, normalizedEmail, normalizedMobile, source, state, totalEnquiries, totalLost, totalWon, updatedDate
- CUSTOMER_IDENTITIES: MINOR DRIFT — unexpected fields: createdDate, id, identityType, updatedDate
- ContactKeyword: MINOR DRIFT — unexpected fields: city, contactLimit, contactsCount, id, keywordList, keywordLower, keywords, keywordsArray, keywordsCount, keywordsList, outletName, receivedCount, sentCount, source
- EMPLOYEE_TARGETING: MINOR DRIFT — unexpected fields: achieveNetSales, achievementPercentage, createdAt, decForecastNetSales, id, month, order, saleExecutive, saleExecutiveId, updatedAt, year, zone
- EVENTS: MINOR DRIFT — mixed types: dateTime, expiryDate, updatedAt; unexpected fields: address, city, createdAt, dateTime, description, eventId, expiryDate, fees, id, imageList, imageUrl, isActive, isFree, isPaid, location, members, name, offer, outletId, postLink, registrationType, terms, title, updatedAt
- EVENT_TRANSACTIONS: MINOR DRIFT — unexpected fields: amount, date, eventId, fileLink, message, paymentType, remark, status, transactionId, updatedAt
- EXPENSE: MAJOR DRIFT — mixed types: approvedAt, dateTime, rejectedAt, reviewedAt, totalKm; unexpected fields: approvedAt, approvedBy, budgetAllocationId, budgetApplied, budgetAppliedAmount, budgetVersion, createdDate, dateTime, dayId, editFlag, expCatRefId, id, image, invoiceDate, invoiceImage, invoiceNo, journeyFrom, journeyTo, monthId, paymentMode, purpose, rejectedAt, rejectedBy, rejectionReason, reviewedAt, reviewedBy, totalKm, travelMode, updateDate
- EXPENSE_BUDGET: MINOR DRIFT — unexpected fields: approvedExpenseCount, createdBy, currency, id, month, notes, originalAllocatedAmount, remainingAmount, revision, targetId, targetLabel, targetType, updatedBy, usedAmount
- EXPENSE_HEADER: MINOR DRIFT — unexpected fields: category, categoryNo, id, isActive
- FACEBOOK_PAGES: MINOR DRIFT — unexpected fields: connectedBy, createdDate, isActive, isSubscribed, pageAccessToken, pageId, pageName, updatedDate, userAccessToken
- HOLIDAY: MINOR DRIFT — mixed types: date; unexpected fields: applicableOutlets, applicableStates, dateString, id, isActive, isPaid, lastUpdated, title, type, updatedBy, year
- INTEGRATION: MINOR DRIFT — mixed types: createdDate; unexpected fields: accessToken, autoAssignEmployeeName, autoAssignEnabled, autoAssignUserId, autoassignenabled, createdDate, description, id, integrationKey, isActive, isDemo, lastSyncTimestamp, modifiedDate, outletId, type
- LEADS_MANAGEMENT: BLOCKING DRIFT — 241 document IDs exceed legacy_id VARCHAR(64); mixed types: customerId, extraData.receiverMobile, leadDate, state; unexpected fields: adId, area, assignedBy, businessName, businessType, city, comments, contact, created, createdDateTime, date, extraData, followUpName, id, isCustomer, isDealerLead, isDuplicate, leadCampaign, leadCreatedDate, leadDate, leadRefId, leadTag, leadid, leadtype, logId, mobileAlt, monthId, prefix, remarks, reqBody, requirement, state, time, updatedDate, username, whatsappShareCount, whatsappShareToken, yearId, zone
- LEAD_ACTIVITIES: MAJOR DRIFT — unexpected fields: checkinLocation, checkoutLocation, createdDate, createdDateInMili, createdDateInMill, id, imageUrl, leadMobile, leadName, leadRequirement, mode, productDealerPrice, productId, productMrpPrice, productName, productType, remark, scheduledDate, scheduledTime, travelMode; status unknown enums: DEMO , HOLD, INSTALLATION
- LEAD_SHARE_TOKENS: MINOR DRIFT — unexpected fields: createdDate
- LEAVE_APPLICATION: MAJOR DRIFT — mixed types: remark; unexpected fields: actionTakenBy, createdDate, dayId, duration, fromDate, id, leaveApplicationId, leaveNote, leaveType, managerId, managerName, monthId, noDays, remark, toDate, uid, updateddate, userName, userProfileId
- LEAVE_BALANCE: MAJOR DRIFT — unexpected fields: designation, empCode, id, isActive, lastUpdated, managerId, managerName, remainingLeaves, totalLeaves, updatedBy, usedLeaves, userName
- LEAVE_TYPE: MINOR DRIFT — unexpected fields: accrualType, allowHalfDay, carryForward, description, id, isPaid, maxPerYear, requiresApproval, shortCode
- MESSAGING_CONFIG: MINOR DRIFT — unexpected fields: id, integrated_number, isActive, key, platform, template_id, template_name, type
- MODULE_SUBSCRIPTION: MINOR DRIFT — unexpected fields: activeUserIds, amount, createdDate, duration, enabledFeatureKeys, featureKey, id, isActive, permittedUsers, renewalDate, revision, schemaVersion, transactionId, updatedBy, updatedDate
- OUTLET: MINOR DRIFT — unexpected fields: active, billingType, branch, businessMaster, city, createdBy, createdDate, email, enabledFeatureKeys, eraseOutlet, featureAccessUpdatedAt, featureAccessUpdatedBy, id, isDemo, isProd, latLang, merchantId, merchantKey, outletCode, packageName, phone, pincode, renewalDate, state
- PAYROLL: MAJOR DRIFT — unexpected fields: actualPayrollCost, approvedAt, approvedBy, attendanceSummary, calculationHash, createdBy, ctc, deductions, earnings, employeeGender, employeeName, employeeRef, employerContributions, financialYear, id, idempotencyKey, lockedAt, lockedBy, lopDays, paidAt, paidBy, payableDays, payrollId, perDaySalary, ruleBreakup, runId, salaryType, standardMonthlyCTC, state, statutoryRuleVersions, userProfileId
- PERMISSIONS_MASTER: MINOR DRIFT — unexpected fields: category, createdAt, createdBy, description, id, key, label, updatedAt, updatedBy
- PRODUCT: MINOR DRIFT — mixed types: uidMap.ISBN, uidMap.SerialNumber, updatedAt; unexpected fields: brand, category, currentStock, customFields, description, id, isAddOn, isDeleted, minUnit, mrpPrice, reorderLevel
- PUBLIC_URLS: MAJOR DRIFT — unexpected fields: createdDate, displayName, docId, updatedDate, url, userId
- QR_SESSIONS: MAJOR DRIFT — mixed types: userId; unexpected fields: expiryAt, id, isLoggedIn
- QUICK_CONTACTS: MINOR DRIFT — unexpected fields: businessType, companyName, createdDate, id, mobile, name, outletId, sourceName, sourceType, updatedDate
- SALARY_MASTER: MAJOR DRIFT — unexpected fields: advanceDeduction, basic, bonusApplicable, conveyance, createdBy, ctc, da, department, designation, empCode, employeeName, employeeRef, esiApplicable, esiDeduction, gender, gratuityApplicable, grossSalary, hra, id, incentive, isActive, isMetroCity, joiningDate, leavePolicyId, lwfApplicable, medical, monthDayRule, monthlySalary, otAllowed, otApplicable, otRatePerHour, otherAllowance, otherDeduction, paidHolidayIncluded, pfApplicable, pfCeilingApplicable, pfDeduction, preview, professionalTax, ptApplicable, salaryType, specialAllowance, tdsApplicable, userName, userProfileId, weeklyOffPaid, workLocationState
- SCHEDULE_MESSAGES: MINOR DRIFT — unexpected fields: id, link, messageUuid, mobile, msgStatus, name, nextScheduleDate, nextScheduleDateMili, nextStatus, nextTemplate, sentDate, sentDateMili, sentTemplate, updateDate
- STATE: MINOR DRIFT — unexpected fields: code, id, name, namw, zone
- STATUS_HISTORY: MINOR DRIFT — unexpected fields: changedAt, changedBy, fromStatus, id, reason, toStatus
- TASK_MANAGMENT: MINOR DRIFT — unexpected fields: assignedAt, assignedBy, assignedByName, assignedTo, assignedToDepartment, assignedToName, createdAt, createdBy, description, dueAt, dueDate, dueTime, isDeleted, isOpen, outletId, outletTimeZone, priority, priorityRank, progressPercent, status, taskDate, taskNumber, taskType, title, updatedAt, updatedBy, version
- TEAM_TREE: MINOR DRIFT — unexpected fields: appPermissionsList, appVersion, code, createdBy, createdDate, empCode, gender, id, isManager, isOnPayRoll, joiningDate, onRole, team, teamHeadProfileId, userName, userProfileId, zoneHeadProfileId, zoneList
- TRACKING_HISTORY: MINOR DRIFT — unexpected fields: address, currentlocation, id, mobile, name, userID
- TRANSACTIONS: MINOR DRIFT — unexpected fields: allocatedAmountAfter, allocationId, amount, balanceAfter, createdAt, createdBy, id, type
- TRANSFER_REQUEST: MAJOR DRIFT — unexpected fields: acceptedQuantity, actionDate, actionTakenBy, actionTakenByName, fromWarehouse, id, productName, remarks, requestDate, requestedByName, requestedQuantity, toWarehouse; status unknown enums: ACCEPTED, PENDING
- USER_PROFILE: MAJOR DRIFT — mixed types: created_time; unexpected fields: address, allowedPremises, bankAccountMasked, cityList, createdDate, created_time, dateOfBirth, department, departmentAccessList, designation, display_name, empCode, employeeCode, gender, id, isDealer, isDeleted, isDemo, joiningDate, outletRoles, outlets, panMasked, permissionList, phone_number, pincode, quickPin, renewalDate, sidebarMenuOrderByOutlet, state, subscriptionAmount
- UserExpenseBalance: MAJOR DRIFT — unexpected fields: amount, date, id, userId
- WHATSAPP_MESSAGES: MINOR DRIFT — mixed types: createdDateTime; unexpected fields: category, createdDateTime, createdDateTimeMili, customerName, id, integrated_number, isRead, lastReadAt, lastReadAtMili, originalTime, unreadCount, updatedDate, updatedDateTime, updatedDateTimeMili, whatsappCategoryStats, whatsappStatsVersion
- WHATSAPP_TEMPLATES: MINOR DRIFT — unexpected fields: createdAt, id, isActive, languageCode, name, outletId, parameterMapping, recipientType, templateName, triggerEvent, updatedAt
- ZONE: MINOR DRIFT — unexpected fields: id, zone
- fcm_tokens: MINOR DRIFT — unexpected fields: created_at, device_type, fcm_token
- ff_user_push_notifications: MINOR DRIFT — unexpected fields: initial_page_name, notification_sound, notification_text, notification_title, parameter_data, sender, timestamp, user_refs

## 5. Mixed types

- ATTENDANCE.checkInLocation: GeoPoint, string
- ATTENDANCE.checkOutLocation: GeoPoint, string
- ATTENDANCE.createdDate: Timestamp, number
- CALL_LOGS.deviceId: null, string
- CALL_LOGS.name: null, string
- CALL_LOGS.simLabel: null, string
- CALL_LOGS.simPhoneNumber: null, string
- CALL_LOGS.subscriptionId: null, string
- CONTACTS.Type: null, string
- CONTACTS.address: null, string
- CONTACTS.category: null, string
- CONTACTS.email: null, string
- CONTACTS.eventDateTime: number, string
- CONTACTS.mobile: number, string
- CONTACTS.website: null, string
- EVENTS.dateTime: Timestamp, string
- EVENTS.expiryDate: Timestamp, string
- EVENTS.updatedAt: Timestamp, number
- EXPENSE.approvedAt: null, number
- EXPENSE.dateTime: Timestamp, string
- EXPENSE.rejectedAt: null, number
- EXPENSE.reviewedAt: null, number
- EXPENSE.totalKm: number, string
- HOLIDAY.date: number, string
- INTEGRATION.createdDate: number, string
- LEADS_MANAGEMENT.customerId: null, string
- LEADS_MANAGEMENT.extraData.receiverMobile: null, string
- LEADS_MANAGEMENT.leadDate: Timestamp, string
- LEADS_MANAGEMENT.state: null, string
- LEAVE_APPLICATION.remark: null, string
- PRODUCT.uidMap.ISBN: null, string
- PRODUCT.uidMap.SerialNumber: null, string
- PRODUCT.updatedAt: Timestamp, number
- QR_SESSIONS.userId: null, string
- USER_PROFILE.created_time: Timestamp, string
- WHATSAPP_MESSAGES.createdDateTime: Timestamp, string

## 6. Missing fields

None.

## 7. Unexpected fields

- ACTIVITY.action
- ACTIVITY.actorName
- ACTIVITY.actorUserId
- ACTIVITY.newValue
- ACTIVITY.oldValue
- ACTIVITY.outletId
- ACTIVITY.taskId
- ACTIVITY.timestamp
- APP_SETTINGS.deviceId
- APP_SETTINGS.settingList
- ATTENDANCE.checkInLocationDetails
- ATTENDANCE.checkInSource
- ATTENDANCE.checkInTime
- ATTENDANCE.checkOutLocationDetails
- ATTENDANCE.checkOutSource
- ATTENDANCE.checkOutTime
- ATTENDANCE.createdDate
- ATTENDANCE.dayId
- ATTENDANCE.device
- ATTENDANCE.dvcIP
- ATTENDANCE.dvcId
- ATTENDANCE.empCode
- ATTENDANCE.employeeCode
- ATTENDANCE.id
- ATTENDANCE.isPresent
- ATTENDANCE.lastUpdatedAt
- ATTENDANCE.monthId
- ATTENDANCE.note
- ATTENDANCE.punchId
- ATTENDANCE.source
- ATTENDANCE.status
- ATTENDANCE.txnInId
- ATTENDANCE.txnOutId
- ATTENDANCE.userName
- ATTENDANCE.yearId
- AUTOLEAD_ASSIGN.adId
- AUTOLEAD_ASSIGN.createdDate
- AUTOLEAD_ASSIGN.employeeName
- AUTOLEAD_ASSIGN.id
- AUTOLEAD_ASSIGN.integrationId
- AUTOLEAD_ASSIGN.isActive
- AUTOLEAD_ASSIGN.modifiedDate
- AUTOLEAD_ASSIGN.platformName
- AUTOMATION_RULES.automationConfigured
- AUTOMATION_RULES.buttonText
- AUTOMATION_RULES.buttonUrl
- AUTOMATION_RULES.buttonUrlExample
- AUTOMATION_RULES.category
- AUTOMATION_RULES.createdAt
- AUTOMATION_RULES.footerText
- AUTOMATION_RULES.headerText
- AUTOMATION_RULES.id
- AUTOMATION_RULES.isActive
- AUTOMATION_RULES.languageCode
- AUTOMATION_RULES.messageBody
- AUTOMATION_RULES.msg91TemplateId
- AUTOMATION_RULES.name
- AUTOMATION_RULES.outletId
- AUTOMATION_RULES.parameterMapping
- AUTOMATION_RULES.recipientType
- AUTOMATION_RULES.rejectionReason
- AUTOMATION_RULES.templateName
- AUTOMATION_RULES.templateStatus
- AUTOMATION_RULES.triggerEvent
- AUTOMATION_RULES.updatedAt
- BUSINESSS_MASTER.active
- BUSINESSS_MASTER.createdBy
- BUSINESSS_MASTER.createdDate
- BUSINESSS_MASTER.email
- BUSINESSS_MASTER.gstin
- BUSINESSS_MASTER.id
- BUSINESSS_MASTER.industry
- BUSINESSS_MASTER.isDemo
- BUSINESSS_MASTER.legalName
- BUSINESSS_MASTER.ownerName
- BUSINESSS_MASTER.pan
- BUSINESSS_MASTER.phone_number
- CALL_LOGS.department
- CALL_LOGS.deviceId
- CALL_LOGS.durationSeconds
- CALL_LOGS.id
- CALL_LOGS.name
- CALL_LOGS.number
- CALL_LOGS.phoneAccountId
- CALL_LOGS.receiverMobileNo
- CALL_LOGS.receiverName
- CALL_LOGS.simLabel
- CALL_LOGS.simPhoneNumber
- CALL_LOGS.subscriptionId
- CALL_LOGS.uploadedAt
- CATEGORY.id
- CATEGORY.isDeleted
- CITIES.cityName
- CITIES.code
- CITIES.id
- CITIES.name
- CITIES.state
- COMPANY_DETAILS.text
- CONTACTS.Type
- CONTACTS.address
- CONTACTS.area
- CONTACTS.assignedAt
- CONTACTS.assignedEmployeeCode
- CONTACTS.assignedUserId
- CONTACTS.assignedUserName
- CONTACTS.category
- CONTACTS.city
- CONTACTS.comments
- CONTACTS.country
- CONTACTS.eventDateTime
- CONTACTS.eventDetails
- CONTACTS.eventId
- CONTACTS.eventName
- CONTACTS.eventReference
- CONTACTS.eventRegistrationLink
- CONTACTS.excelRowNumber
- CONTACTS.fileName
- CONTACTS.id
- CONTACTS.importId
- CONTACTS.reason
- CONTACTS.region
- CONTACTS.source
- CONTACTS.transferedList
- CONTACTS.uploadName
- CONTACTS.uploadType
- CONTACTS.uploadedBy
- CONTACTS.uploadedDateTime
- CONTACTS.website
- CONTACTS.worksheetName
- COUNTRIES.countryCode
- COUNTRIES.countryFlag
- COUNTRIES.countryNameCommon
- COUNTRIES.countryNameOfficial
- COUNTRIES.id
- COUNTRIES.isActive
- CUSTOMERS.area
- CUSTOMERS.businessName
- CUSTOMERS.businessType
- CUSTOMERS.city
- CUSTOMERS.createdDate
- CUSTOMERS.customerCode
- CUSTOMERS.customerName
- CUSTOMERS.id
- CUSTOMERS.lifecycle
- CUSTOMERS.normalizedBusinessName
- CUSTOMERS.normalizedCustomerCode
- CUSTOMERS.normalizedCustomerName
- CUSTOMERS.normalizedEmail
- CUSTOMERS.normalizedMobile
- CUSTOMERS.source
- CUSTOMERS.state
- CUSTOMERS.totalEnquiries
- CUSTOMERS.totalLost
- CUSTOMERS.totalWon
- CUSTOMERS.updatedDate
- CUSTOMER_IDENTITIES.createdDate
- CUSTOMER_IDENTITIES.id
- CUSTOMER_IDENTITIES.identityType
- CUSTOMER_IDENTITIES.updatedDate
- ContactKeyword.city
- ContactKeyword.contactLimit
- ContactKeyword.contactsCount
- ContactKeyword.id
- ContactKeyword.keywordList
- ContactKeyword.keywordLower
- ContactKeyword.keywords
- ContactKeyword.keywordsArray
- ContactKeyword.keywordsCount
- ContactKeyword.keywordsList
- ContactKeyword.outletName
- ContactKeyword.receivedCount
- ContactKeyword.sentCount
- ContactKeyword.source
- EMPLOYEE_TARGETING.achieveNetSales
- EMPLOYEE_TARGETING.achievementPercentage
- EMPLOYEE_TARGETING.createdAt
- EMPLOYEE_TARGETING.decForecastNetSales
- EMPLOYEE_TARGETING.id
- EMPLOYEE_TARGETING.month
- EMPLOYEE_TARGETING.order
- EMPLOYEE_TARGETING.saleExecutive
- EMPLOYEE_TARGETING.saleExecutiveId
- EMPLOYEE_TARGETING.updatedAt
- EMPLOYEE_TARGETING.year
- EMPLOYEE_TARGETING.zone
- EVENTS.address
- EVENTS.city
- EVENTS.createdAt
- EVENTS.dateTime
- EVENTS.description
- EVENTS.eventId
- EVENTS.expiryDate
- EVENTS.fees
- EVENTS.id
- EVENTS.imageList
- EVENTS.imageUrl
- EVENTS.isActive
- EVENTS.isFree
- EVENTS.isPaid
- EVENTS.location
- EVENTS.members
- EVENTS.name
- EVENTS.offer
- EVENTS.outletId
- EVENTS.postLink
- EVENTS.registrationType
- EVENTS.terms
- EVENTS.title
- EVENTS.updatedAt
- EVENT_TRANSACTIONS.amount
- EVENT_TRANSACTIONS.date
- EVENT_TRANSACTIONS.eventId
- EVENT_TRANSACTIONS.fileLink
- EVENT_TRANSACTIONS.message
- EVENT_TRANSACTIONS.paymentType
- EVENT_TRANSACTIONS.remark
- EVENT_TRANSACTIONS.status
- EVENT_TRANSACTIONS.transactionId
- EVENT_TRANSACTIONS.updatedAt
- EXPENSE.approvedAt
- EXPENSE.approvedBy
- EXPENSE.budgetAllocationId
- EXPENSE.budgetApplied
- EXPENSE.budgetAppliedAmount
- EXPENSE.budgetVersion
- EXPENSE.createdDate
- EXPENSE.dateTime
- EXPENSE.dayId
- EXPENSE.editFlag
- EXPENSE.expCatRefId
- EXPENSE.id
- EXPENSE.image
- EXPENSE.invoiceDate
- EXPENSE.invoiceImage
- EXPENSE.invoiceNo
- EXPENSE.journeyFrom
- EXPENSE.journeyTo
- EXPENSE.monthId
- EXPENSE.paymentMode
- EXPENSE.purpose
- EXPENSE.rejectedAt
- EXPENSE.rejectedBy
- EXPENSE.rejectionReason
- EXPENSE.reviewedAt
- EXPENSE.reviewedBy
- EXPENSE.totalKm
- EXPENSE.travelMode
- EXPENSE.updateDate
- EXPENSE_BUDGET.approvedExpenseCount
- EXPENSE_BUDGET.createdBy
- EXPENSE_BUDGET.currency
- EXPENSE_BUDGET.id
- EXPENSE_BUDGET.month
- EXPENSE_BUDGET.notes
- EXPENSE_BUDGET.originalAllocatedAmount
- EXPENSE_BUDGET.remainingAmount
- EXPENSE_BUDGET.revision
- EXPENSE_BUDGET.targetId
- EXPENSE_BUDGET.targetLabel
- EXPENSE_BUDGET.targetType
- EXPENSE_BUDGET.updatedBy
- EXPENSE_BUDGET.usedAmount
- EXPENSE_HEADER.category
- EXPENSE_HEADER.categoryNo
- EXPENSE_HEADER.id
- EXPENSE_HEADER.isActive
- FACEBOOK_PAGES.connectedBy
- FACEBOOK_PAGES.createdDate
- FACEBOOK_PAGES.isActive
- FACEBOOK_PAGES.isSubscribed
- FACEBOOK_PAGES.pageAccessToken
- FACEBOOK_PAGES.pageId
- FACEBOOK_PAGES.pageName
- FACEBOOK_PAGES.updatedDate
- FACEBOOK_PAGES.userAccessToken
- HOLIDAY.applicableOutlets
- HOLIDAY.applicableStates
- HOLIDAY.dateString
- HOLIDAY.id
- HOLIDAY.isActive
- HOLIDAY.isPaid
- HOLIDAY.lastUpdated
- HOLIDAY.title
- HOLIDAY.type
- HOLIDAY.updatedBy
- HOLIDAY.year
- INTEGRATION.accessToken
- INTEGRATION.autoAssignEmployeeName
- INTEGRATION.autoAssignEnabled
- INTEGRATION.autoAssignUserId
- INTEGRATION.autoassignenabled
- INTEGRATION.createdDate
- INTEGRATION.description
- INTEGRATION.id
- INTEGRATION.integrationKey
- INTEGRATION.isActive
- INTEGRATION.isDemo
- INTEGRATION.lastSyncTimestamp
- INTEGRATION.modifiedDate
- INTEGRATION.outletId
- INTEGRATION.type
- LEADS_MANAGEMENT.adId
- LEADS_MANAGEMENT.area
- LEADS_MANAGEMENT.assignedBy
- LEADS_MANAGEMENT.businessName
- LEADS_MANAGEMENT.businessType
- LEADS_MANAGEMENT.city
- LEADS_MANAGEMENT.comments
- LEADS_MANAGEMENT.contact
- LEADS_MANAGEMENT.created
- LEADS_MANAGEMENT.createdDateTime
- LEADS_MANAGEMENT.date
- LEADS_MANAGEMENT.extraData
- LEADS_MANAGEMENT.followUpName
- LEADS_MANAGEMENT.id
- LEADS_MANAGEMENT.isCustomer
- LEADS_MANAGEMENT.isDealerLead
- LEADS_MANAGEMENT.isDuplicate
- LEADS_MANAGEMENT.leadCampaign
- LEADS_MANAGEMENT.leadCreatedDate
- LEADS_MANAGEMENT.leadDate
- LEADS_MANAGEMENT.leadRefId
- LEADS_MANAGEMENT.leadTag
- LEADS_MANAGEMENT.leadid
- LEADS_MANAGEMENT.leadtype
- LEADS_MANAGEMENT.logId
- LEADS_MANAGEMENT.mobileAlt
- LEADS_MANAGEMENT.monthId
- LEADS_MANAGEMENT.prefix
- LEADS_MANAGEMENT.remarks
- LEADS_MANAGEMENT.reqBody
- LEADS_MANAGEMENT.requirement
- LEADS_MANAGEMENT.state
- LEADS_MANAGEMENT.time
- LEADS_MANAGEMENT.updatedDate
- LEADS_MANAGEMENT.username
- LEADS_MANAGEMENT.whatsappShareCount
- LEADS_MANAGEMENT.whatsappShareToken
- LEADS_MANAGEMENT.yearId
- LEADS_MANAGEMENT.zone
- LEAD_ACTIVITIES.checkinLocation
- LEAD_ACTIVITIES.checkoutLocation
- LEAD_ACTIVITIES.createdDate
- LEAD_ACTIVITIES.createdDateInMili
- LEAD_ACTIVITIES.createdDateInMill
- LEAD_ACTIVITIES.id
- LEAD_ACTIVITIES.imageUrl
- LEAD_ACTIVITIES.leadMobile
- LEAD_ACTIVITIES.leadName
- LEAD_ACTIVITIES.leadRequirement
- LEAD_ACTIVITIES.mode
- LEAD_ACTIVITIES.productDealerPrice
- LEAD_ACTIVITIES.productId
- LEAD_ACTIVITIES.productMrpPrice
- LEAD_ACTIVITIES.productName
- LEAD_ACTIVITIES.productType
- LEAD_ACTIVITIES.remark
- LEAD_ACTIVITIES.scheduledDate
- LEAD_ACTIVITIES.scheduledTime
- LEAD_ACTIVITIES.travelMode
- LEAD_SHARE_TOKENS.createdDate
- LEAVE_APPLICATION.actionTakenBy
- LEAVE_APPLICATION.createdDate
- LEAVE_APPLICATION.dayId
- LEAVE_APPLICATION.duration
- LEAVE_APPLICATION.fromDate
- LEAVE_APPLICATION.id
- LEAVE_APPLICATION.leaveApplicationId
- LEAVE_APPLICATION.leaveNote
- LEAVE_APPLICATION.leaveType
- LEAVE_APPLICATION.managerId
- LEAVE_APPLICATION.managerName
- LEAVE_APPLICATION.monthId
- LEAVE_APPLICATION.noDays
- LEAVE_APPLICATION.remark
- LEAVE_APPLICATION.toDate
- LEAVE_APPLICATION.uid
- LEAVE_APPLICATION.updateddate
- LEAVE_APPLICATION.userName
- LEAVE_APPLICATION.userProfileId
- LEAVE_BALANCE.designation
- LEAVE_BALANCE.empCode
- LEAVE_BALANCE.id
- LEAVE_BALANCE.isActive
- LEAVE_BALANCE.lastUpdated
- LEAVE_BALANCE.managerId
- LEAVE_BALANCE.managerName
- LEAVE_BALANCE.remainingLeaves
- LEAVE_BALANCE.totalLeaves
- LEAVE_BALANCE.updatedBy
- LEAVE_BALANCE.usedLeaves
- LEAVE_BALANCE.userName
- LEAVE_TYPE.accrualType
- LEAVE_TYPE.allowHalfDay
- LEAVE_TYPE.carryForward
- LEAVE_TYPE.description
- LEAVE_TYPE.id
- LEAVE_TYPE.isPaid
- LEAVE_TYPE.maxPerYear
- LEAVE_TYPE.requiresApproval
- LEAVE_TYPE.shortCode
- MESSAGING_CONFIG.id
- MESSAGING_CONFIG.integrated_number
- MESSAGING_CONFIG.isActive
- MESSAGING_CONFIG.key
- MESSAGING_CONFIG.platform
- MESSAGING_CONFIG.template_id
- MESSAGING_CONFIG.template_name
- MESSAGING_CONFIG.type
- MODULE_SUBSCRIPTION.activeUserIds
- MODULE_SUBSCRIPTION.amount
- MODULE_SUBSCRIPTION.createdDate
- MODULE_SUBSCRIPTION.duration
- MODULE_SUBSCRIPTION.enabledFeatureKeys
- MODULE_SUBSCRIPTION.featureKey
- MODULE_SUBSCRIPTION.id
- MODULE_SUBSCRIPTION.isActive
- MODULE_SUBSCRIPTION.permittedUsers
- MODULE_SUBSCRIPTION.renewalDate
- MODULE_SUBSCRIPTION.revision
- MODULE_SUBSCRIPTION.schemaVersion
- MODULE_SUBSCRIPTION.transactionId
- MODULE_SUBSCRIPTION.updatedBy
- MODULE_SUBSCRIPTION.updatedDate
- OUTLET.active
- OUTLET.billingType
- OUTLET.branch
- OUTLET.businessMaster
- OUTLET.city
- OUTLET.createdBy
- OUTLET.createdDate
- OUTLET.email
- OUTLET.enabledFeatureKeys
- OUTLET.eraseOutlet
- OUTLET.featureAccessUpdatedAt
- OUTLET.featureAccessUpdatedBy
- OUTLET.id
- OUTLET.isDemo
- OUTLET.isProd
- OUTLET.latLang
- OUTLET.merchantId
- OUTLET.merchantKey
- OUTLET.outletCode
- OUTLET.packageName
- OUTLET.phone
- OUTLET.pincode
- OUTLET.renewalDate
- OUTLET.state
- PAYROLL.actualPayrollCost
- PAYROLL.approvedAt
- PAYROLL.approvedBy
- PAYROLL.attendanceSummary
- PAYROLL.calculationHash
- PAYROLL.createdBy
- PAYROLL.ctc
- PAYROLL.deductions
- PAYROLL.earnings
- PAYROLL.employeeGender
- PAYROLL.employeeName
- PAYROLL.employeeRef
- PAYROLL.employerContributions
- PAYROLL.financialYear
- PAYROLL.id
- PAYROLL.idempotencyKey
- PAYROLL.lockedAt
- PAYROLL.lockedBy
- PAYROLL.lopDays
- PAYROLL.paidAt
- PAYROLL.paidBy
- PAYROLL.payableDays
- PAYROLL.payrollId
- PAYROLL.perDaySalary
- PAYROLL.ruleBreakup
- PAYROLL.runId
- PAYROLL.salaryType
- PAYROLL.standardMonthlyCTC
- PAYROLL.state
- PAYROLL.statutoryRuleVersions
- PAYROLL.userProfileId
- PERMISSIONS_MASTER.category
- PERMISSIONS_MASTER.createdAt
- PERMISSIONS_MASTER.createdBy
- PERMISSIONS_MASTER.description
- PERMISSIONS_MASTER.id
- PERMISSIONS_MASTER.key
- PERMISSIONS_MASTER.label
- PERMISSIONS_MASTER.updatedAt
- PERMISSIONS_MASTER.updatedBy
- PRODUCT.brand
- PRODUCT.category
- PRODUCT.currentStock
- PRODUCT.customFields
- PRODUCT.description
- PRODUCT.id
- PRODUCT.isAddOn
- PRODUCT.isDeleted
- PRODUCT.minUnit
- PRODUCT.mrpPrice
- PRODUCT.reorderLevel
- PUBLIC_URLS.createdDate
- PUBLIC_URLS.displayName
- PUBLIC_URLS.docId
- PUBLIC_URLS.updatedDate
- PUBLIC_URLS.url
- PUBLIC_URLS.userId
- QR_SESSIONS.expiryAt
- QR_SESSIONS.id
- QR_SESSIONS.isLoggedIn
- QUICK_CONTACTS.businessType
- QUICK_CONTACTS.companyName
- QUICK_CONTACTS.createdDate
- QUICK_CONTACTS.id
- QUICK_CONTACTS.mobile
- QUICK_CONTACTS.name
- QUICK_CONTACTS.outletId
- QUICK_CONTACTS.sourceName
- QUICK_CONTACTS.sourceType
- QUICK_CONTACTS.updatedDate
- SALARY_MASTER.advanceDeduction
- SALARY_MASTER.basic
- SALARY_MASTER.bonusApplicable
- SALARY_MASTER.conveyance
- SALARY_MASTER.createdBy
- SALARY_MASTER.ctc
- SALARY_MASTER.da
- SALARY_MASTER.department
- SALARY_MASTER.designation
- SALARY_MASTER.empCode
- SALARY_MASTER.employeeName
- SALARY_MASTER.employeeRef
- SALARY_MASTER.esiApplicable
- SALARY_MASTER.esiDeduction
- SALARY_MASTER.gender
- SALARY_MASTER.gratuityApplicable
- SALARY_MASTER.grossSalary
- SALARY_MASTER.hra
- SALARY_MASTER.id
- SALARY_MASTER.incentive
- SALARY_MASTER.isActive
- SALARY_MASTER.isMetroCity
- SALARY_MASTER.joiningDate
- SALARY_MASTER.leavePolicyId
- SALARY_MASTER.lwfApplicable
- SALARY_MASTER.medical
- SALARY_MASTER.monthDayRule
- SALARY_MASTER.monthlySalary
- SALARY_MASTER.otAllowed
- SALARY_MASTER.otApplicable
- SALARY_MASTER.otRatePerHour
- SALARY_MASTER.otherAllowance
- SALARY_MASTER.otherDeduction
- SALARY_MASTER.paidHolidayIncluded
- SALARY_MASTER.pfApplicable
- SALARY_MASTER.pfCeilingApplicable
- SALARY_MASTER.pfDeduction
- SALARY_MASTER.preview
- SALARY_MASTER.professionalTax
- SALARY_MASTER.ptApplicable
- SALARY_MASTER.salaryType
- SALARY_MASTER.specialAllowance
- SALARY_MASTER.tdsApplicable
- SALARY_MASTER.userName
- SALARY_MASTER.userProfileId
- SALARY_MASTER.weeklyOffPaid
- SALARY_MASTER.workLocationState
- SCHEDULE_MESSAGES.id
- SCHEDULE_MESSAGES.link
- SCHEDULE_MESSAGES.messageUuid
- SCHEDULE_MESSAGES.mobile
- SCHEDULE_MESSAGES.msgStatus
- SCHEDULE_MESSAGES.name
- SCHEDULE_MESSAGES.nextScheduleDate
- SCHEDULE_MESSAGES.nextScheduleDateMili
- SCHEDULE_MESSAGES.nextStatus
- SCHEDULE_MESSAGES.nextTemplate
- SCHEDULE_MESSAGES.sentDate
- SCHEDULE_MESSAGES.sentDateMili
- SCHEDULE_MESSAGES.sentTemplate
- SCHEDULE_MESSAGES.updateDate
- STATE.code
- STATE.id
- STATE.name
- STATE.namw
- STATE.zone
- STATUS_HISTORY.changedAt
- STATUS_HISTORY.changedBy
- STATUS_HISTORY.fromStatus
- STATUS_HISTORY.id
- STATUS_HISTORY.reason
- STATUS_HISTORY.toStatus
- TASK_MANAGMENT.assignedAt
- TASK_MANAGMENT.assignedBy
- TASK_MANAGMENT.assignedByName
- TASK_MANAGMENT.assignedTo
- TASK_MANAGMENT.assignedToDepartment
- TASK_MANAGMENT.assignedToName
- TASK_MANAGMENT.createdAt
- TASK_MANAGMENT.createdBy
- TASK_MANAGMENT.description
- TASK_MANAGMENT.dueAt
- TASK_MANAGMENT.dueDate
- TASK_MANAGMENT.dueTime
- TASK_MANAGMENT.isDeleted
- TASK_MANAGMENT.isOpen
- TASK_MANAGMENT.outletId
- TASK_MANAGMENT.outletTimeZone
- TASK_MANAGMENT.priority
- TASK_MANAGMENT.priorityRank
- TASK_MANAGMENT.progressPercent
- TASK_MANAGMENT.status
- TASK_MANAGMENT.taskDate
- TASK_MANAGMENT.taskNumber
- TASK_MANAGMENT.taskType
- TASK_MANAGMENT.title
- TASK_MANAGMENT.updatedAt
- TASK_MANAGMENT.updatedBy
- TASK_MANAGMENT.version
- TEAM_TREE.appPermissionsList
- TEAM_TREE.appVersion
- TEAM_TREE.code
- TEAM_TREE.createdBy
- TEAM_TREE.createdDate
- TEAM_TREE.empCode
- TEAM_TREE.gender
- TEAM_TREE.id
- TEAM_TREE.isManager
- TEAM_TREE.isOnPayRoll
- TEAM_TREE.joiningDate
- TEAM_TREE.onRole
- TEAM_TREE.team
- TEAM_TREE.teamHeadProfileId
- TEAM_TREE.userName
- TEAM_TREE.userProfileId
- TEAM_TREE.zoneHeadProfileId
- TEAM_TREE.zoneList
- TRACKING_HISTORY.address
- TRACKING_HISTORY.currentlocation
- TRACKING_HISTORY.id
- TRACKING_HISTORY.mobile
- TRACKING_HISTORY.name
- TRACKING_HISTORY.userID
- TRANSACTIONS.allocatedAmountAfter
- TRANSACTIONS.allocationId
- TRANSACTIONS.amount
- TRANSACTIONS.balanceAfter
- TRANSACTIONS.createdAt
- TRANSACTIONS.createdBy
- TRANSACTIONS.id
- TRANSACTIONS.type
- TRANSFER_REQUEST.acceptedQuantity
- TRANSFER_REQUEST.actionDate
- TRANSFER_REQUEST.actionTakenBy
- TRANSFER_REQUEST.actionTakenByName
- TRANSFER_REQUEST.fromWarehouse
- TRANSFER_REQUEST.id
- TRANSFER_REQUEST.productName
- TRANSFER_REQUEST.remarks
- TRANSFER_REQUEST.requestDate
- TRANSFER_REQUEST.requestedByName
- TRANSFER_REQUEST.requestedQuantity
- TRANSFER_REQUEST.toWarehouse
- USER_PROFILE.address
- USER_PROFILE.allowedPremises
- USER_PROFILE.bankAccountMasked
- USER_PROFILE.cityList
- USER_PROFILE.createdDate
- USER_PROFILE.created_time
- USER_PROFILE.dateOfBirth
- USER_PROFILE.department
- USER_PROFILE.departmentAccessList
- USER_PROFILE.designation
- USER_PROFILE.display_name
- USER_PROFILE.empCode
- USER_PROFILE.employeeCode
- USER_PROFILE.gender
- USER_PROFILE.id
- USER_PROFILE.isDealer
- USER_PROFILE.isDeleted
- USER_PROFILE.isDemo
- USER_PROFILE.joiningDate
- USER_PROFILE.outletRoles
- USER_PROFILE.outlets
- USER_PROFILE.panMasked
- USER_PROFILE.permissionList
- USER_PROFILE.phone_number
- USER_PROFILE.pincode
- USER_PROFILE.quickPin
- USER_PROFILE.renewalDate
- USER_PROFILE.sidebarMenuOrderByOutlet
- USER_PROFILE.state
- USER_PROFILE.subscriptionAmount
- UserExpenseBalance.amount
- UserExpenseBalance.date
- UserExpenseBalance.id
- UserExpenseBalance.userId
- WHATSAPP_MESSAGES.category
- WHATSAPP_MESSAGES.createdDateTime
- WHATSAPP_MESSAGES.createdDateTimeMili
- WHATSAPP_MESSAGES.customerName
- WHATSAPP_MESSAGES.id
- WHATSAPP_MESSAGES.integrated_number
- WHATSAPP_MESSAGES.isRead
- WHATSAPP_MESSAGES.lastReadAt
- WHATSAPP_MESSAGES.lastReadAtMili
- WHATSAPP_MESSAGES.originalTime
- WHATSAPP_MESSAGES.unreadCount
- WHATSAPP_MESSAGES.updatedDate
- WHATSAPP_MESSAGES.updatedDateTime
- WHATSAPP_MESSAGES.updatedDateTimeMili
- WHATSAPP_MESSAGES.whatsappCategoryStats
- WHATSAPP_MESSAGES.whatsappStatsVersion
- WHATSAPP_TEMPLATES.createdAt
- WHATSAPP_TEMPLATES.id
- WHATSAPP_TEMPLATES.isActive
- WHATSAPP_TEMPLATES.languageCode
- WHATSAPP_TEMPLATES.name
- WHATSAPP_TEMPLATES.outletId
- WHATSAPP_TEMPLATES.parameterMapping
- WHATSAPP_TEMPLATES.recipientType
- WHATSAPP_TEMPLATES.templateName
- WHATSAPP_TEMPLATES.triggerEvent
- WHATSAPP_TEMPLATES.updatedAt
- ZONE.id
- ZONE.zone
- fcm_tokens.created_at
- fcm_tokens.device_type
- fcm_tokens.fcm_token
- ff_user_push_notifications.initial_page_name
- ff_user_push_notifications.notification_sound
- ff_user_push_notifications.notification_text
- ff_user_push_notifications.notification_title
- ff_user_push_notifications.parameter_data
- ff_user_push_notifications.sender
- ff_user_push_notifications.timestamp
- ff_user_push_notifications.user_refs

## 8. Enum/status drift

- LEAD_ACTIVITIES.status: DEMO , HOLD, INSTALLATION
- TRANSFER_REQUEST.status: ACCEPTED, PENDING

## 9. Orphan relationships

- ACTIVITY.newValue.assignedTo -> USER_PROFILE: 1
- ACTIVITY.oldValue.assignedTo -> USER_PROFILE: 1
- ATTENDANCE.outletId -> OUTLET: 3
- ATTENDANCE.userId -> USER_PROFILE: 170
- AUTOLEAD_ASSIGN.userId -> USER_PROFILE: 1
- EXPENSE.userId -> USER_PROFILE: 2
- LEADS_MANAGEMENT.assignedTo -> USER_PROFILE: 387
- LEADS_MANAGEMENT.customerId -> CUSTOMERS: 2
- LEADS_MANAGEMENT.leadRefId -> LEADS_MANAGEMENT: 241
- LEAD_ACTIVITIES.assignedTo -> USER_PROFILE: 15
- LEAVE_APPLICATION.managerId -> USER_PROFILE: 36
- LEAVE_BALANCE.managerId -> USER_PROFILE: 6
- LEAVE_BALANCE.userId -> USER_PROFILE: 7
- PAYROLL.employeeId -> USER_PROFILE: 12
- PAYROLL.attendanceSummary.employeeId -> USER_PROFILE: 12
- PUBLIC_URLS.userId -> USER_PROFILE: 4
- QR_SESSIONS.userId -> USER_PROFILE: 3
- SALARY_MASTER.userId -> USER_PROFILE: 4
- SALARY_MASTER.employeeId -> USER_PROFILE: 28
- USER_PROFILE.outletId -> OUTLET: 2
- UserExpenseBalance.userId -> USER_PROFILE: 6

## 10. Tenant/outlet inconsistencies

- ATTENDANCE: 3

## 11. Security findings

Legacy password present: 67; missing: 38; null/empty: 0; types: string. Values were not read into output or logs.

## 12. Large document risks

None.

## 13. SHIFT findings

Estimated volume: 0. Fields: none. Proposed table: inventory.shifts (id uuid, tenant_id uuid, outlet_id uuid, legacy_id varchar, opened_by uuid, closed_by uuid, opened_at timestamptz, closed_at timestamptz, opening_cash numeric, closing_cash numeric, status text, source_payload jsonb). Risks: No production SHIFT records were available; schema proposal is provisional.

## 14. Blocking migration issues

- LEADS_MANAGEMENT.__name__: IDs longer than 64 characters (241) — Amend contract width or introduce a lossless ID mapping

## 15. Recommended contract amendments

- Tenant isolation integrity risk
- Blocking VARCHAR(64) incompatibility
- Enum amendment or mapping decision required
- Foreign-key load would fail
- SHIFT contract remains provisional
