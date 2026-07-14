// ═══════════════════════════════════════════════════════════════
//  Abhishek Bank  •  Enhanced with Bank Linking, Recurring, Budgets, Multi-User
// ═══════════════════════════════════════════════════════════════

function doGet() {
  return HtmlService.createHtmlOutputFromFile('form')
      .setTitle('Abhishek Bank — Personal Finance')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function doPost(e) {
  try {
    var contentType = (e.postData && e.postData.type) || '';
    var isJsonRpc = contentType.indexOf('json') !== -1 || contentType.indexOf('text/plain') !== -1;

    if (isJsonRpc) {
      var body = JSON.parse(e.postData.contents);
      var fn = API_ACTIONS_[body.action];
      if (!fn) return jsonOut_({ok:false, error:'Unknown action: ' + body.action});
      var result = fn.apply(null, body.args || []);
      return jsonOut_({ok:true, result: result});
    }

    var params = e.parameter;
    var sms = params.sms || '';
    var parsed = parseSmsSeverSide(sms);
    if (!parsed) return jsonOut_({status:'ignored'});
    submitExpense(parsed.date, parsed.category, parsed.description, parsed.amount, parsed.paymentMode);
    return jsonOut_({status:'ok', amount: parsed.amount, merchant: parsed.description});
  } catch(err) { return jsonOut_({status:'error', ok:false, error: err.toString(), message: err.toString()}); }
}

function jsonOut_(o){ return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

var API_ACTIONS_ = {
  getDashboardData: getDashboardData,
  submitExpense: submitExpense,
  addIncome: addIncome,
  deleteTransaction: deleteTransaction,
  getUpiSettings: getUpiSettings,
  saveUpiSettings: saveUpiSettings,
  logUpiSent: logUpiSent,
  logUpiReceived: logUpiReceived,
  // ─── New: Bank Linking ───
  saveBankAccount: saveBankAccount,
  getBankAccounts: getBankAccounts,
  deleteBankAccount: deleteBankAccount,
  linkBankAccount: linkBankAccount,
  // ─── New: Recurring Expenses ───
  createRecurringExpense: createRecurringExpense,
  getRecurringExpenses: getRecurringExpenses,
  updateRecurringExpense: updateRecurringExpense,
  deleteRecurringExpense: deleteRecurringExpense,
  processRecurringExpenses: processRecurringExpenses,
  // ─── New: Budget Alerts ───
  setBudget: setBudget,
  getBudgets: getBudgets,
  deleteBudget: deleteBudget,
  checkBudgetStatus: checkBudgetStatus,
  // ─── New: Multi-User ───
  getCurrentUser: getCurrentUser,
  addTeamMember: addTeamMember,
  getTeamMembers: getTeamMembers,
  removeTeamMember: removeTeamMember,
  switchUser: switchUser,
  getUserData: getUserData
};

// ═══════════════════════════════════════════════════════════════
// MULTI-USER SUPPORT
// ═══════════════════════════════════════════════════════════════

function getCurrentUser_() {
  var props = PropertiesService.getScriptProperties();
  var userId = Session.getEffectiveUser().getEmail();
  var currentUser = props.getProperty('CURRENT_USER_' + userId);
  return currentUser || userId;
}

function setCurrentUser_(user) {
  var props = PropertiesService.getScriptProperties();
  var userId = Session.getEffectiveUser().getEmail();
  props.setProperty('CURRENT_USER_' + userId, user);
}

function getTeamSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Team');
  if (!sheet) {
    sheet = ss.insertSheet('Team');
    sheet.appendRow(['Email', 'Nickname', 'Role', 'JoinedDate', 'IsActive']);
  }
  return sheet;
}

function getCurrentUser() {
  return {
    email: Session.getEffectiveUser().getEmail(),
    currentIdentity: getCurrentUser_()
  };
}

function addTeamMember(email, nickname) {
  email = (email || '').trim().toLowerCase();
  nickname = (nickname || '').trim();
  if (!/^[\w\.\-\+]+@[\w\.\-]+\.\w+$/.test(email)) {
    throw new Error('Invalid email format');
  }
  var sheet = getTeamSheet_();
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0].toLowerCase() === email) {
      throw new Error('Member already exists');
    }
  }
  sheet.appendRow([email, nickname || email, 'Member', new Date(), true]);
  return { email: email, nickname: nickname, role: 'Member' };
}

function getTeamMembers() {
  var sheet = getTeamSheet_();
  var data = sheet.getDataRange().getValues();
  var members = [];
  for (var i = 1; i < data.length; i++) {
    if (data[i][4]) { // IsActive
      members.push({
        email: data[i][0],
        nickname: data[i][1],
        role: data[i][2],
        joinedDate: Utilities.formatDate(new Date(data[i][3]), Session.getScriptTimeZone(), 'yyyy-MM-dd')
      });
    }
  }
  return members;
}

function removeTeamMember(email) {
  email = (email || '').trim().toLowerCase();
  var sheet = getTeamSheet_();
  var data = sheet.getDataRange().getValues();
  for (var i = data.length - 1; i >= 1; i--) {
    if (data[i][0].toLowerCase() === email) {
      sheet.deleteRow(i + 1);
      return 'Removed';
    }
  }
  return 'Not found';
}

function switchUser(email) {
  email = (email || '').trim().toLowerCase();
  var sheet = getTeamSheet_();
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0].toLowerCase() === email && data[i][4]) {
      setCurrentUser_(email);
      return { success: true, currentUser: email };
    }
  }
  throw new Error('User not found or inactive');
}

function getUserData() {
  return { user: getCurrentUser_(), timestamp: new Date().toISOString() };
}

// ═══════════════════════════════════════════════════════════════
// BANK ACCOUNT LINKING
// ═══════════════════════════════════════════════════════════════

function getBankAccountsSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Bank Accounts');
  if (!sheet) {
    sheet = ss.insertSheet('Bank Accounts');
    sheet.appendRow(['User', 'AccountId', 'BankName', 'AccountType', 'Last4Digits', 'OpeningBalance', 'LinkedDate', 'Provider', 'ProviderAccountId', 'IsActive']);
  }
  return sheet;
}

function saveBankAccount(bankName, accountType, last4, openingBalance, accountId) {
  var user = getCurrentUser_();
  var sheet = getBankAccountsSheet_();
  var accountId = accountId || 'ACC_' + Utilities.getUuid();
  
  sheet.appendRow([
    user,
    accountId,
    bankName,
    accountType || 'Savings',
    last4 || '',
    parseFloat(openingBalance) || 0,
    new Date(),
    'manual',
    '',
    true
  ]);
  
  return { accountId: accountId, bankName: bankName, last4: last4 };
}

function getBankAccounts() {
  var user = getCurrentUser_();
  var sheet = getBankAccountsSheet_();
  var data = sheet.getDataRange().getValues();
  var accounts = [];
  
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === user && data[i][9]) { // IsActive
      accounts.push({
        accountId: data[i][1],
        bankName: data[i][2],
        accountType: data[i][3],
        last4Digits: data[i][4],
        openingBalance: parseFloat(data[i][5]),
        linkedDate: Utilities.formatDate(new Date(data[i][6]), Session.getScriptTimeZone(), 'yyyy-MM-dd'),
        provider: data[i][7]
      });
    }
  }
  return accounts;
}

function deleteBankAccount(accountId) {
  var user = getCurrentUser_();
  var sheet = getBankAccountsSheet_();
  var data = sheet.getDataRange().getValues();
  
  for (var i = data.length - 1; i >= 1; i--) {
    if (data[i][0] === user && data[i][1] === accountId) {
      sheet.deleteRow(i + 1);
      return 'Deleted';
    }
  }
  return 'Not found';
}

function linkBankAccount(provider, authCode) {
  // Placeholder for future bank API integration (Plaid, Finbox, etc.)
  // provider: 'plaid' | 'finbox' | 'manual'
  // authCode: OAuth token or reference
  
  if (provider === 'plaid') {
    // TODO: Exchange authCode for Plaid access token
    // TODO: Fetch account info from Plaid API
    // TODO: Store encrypted access token + metadata
    return { status: 'pending', provider: 'plaid', message: 'Bank linking initiated' };
  }
  
  if (provider === 'finbox') {
    // TODO: Similar flow for Finbox
    return { status: 'pending', provider: 'finbox', message: 'Bank linking initiated' };
  }
  
  throw new Error('Unsupported provider: ' + provider);
}

// ═══════════════════════════════════════════════════════════════
// RECURRING EXPENSES
// ═══════════════════════════════════════════════════════════════

function getRecurringSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Recurring Expenses');
  if (!sheet) {
    sheet = ss.insertSheet('Recurring Expenses');
    sheet.appendRow(['User', 'RecurId', 'Category', 'Description', 'Amount', 'Frequency', 'StartDate', 'EndDate', 'LastProcessed', 'NextDue', 'IsActive']);
  }
  return sheet;
}

function createRecurringExpense(category, description, amount, frequency, startDate, endDate) {
  var user = getCurrentUser_();
  var sheet = getRecurringSheet_();
  var recurId = 'REC_' + Utilities.getUuid();
  var nextDue = calculateNextDue_(new Date(startDate), frequency);
  
  sheet.appendRow([
    user,
    recurId,
    category,
    description,
    parseFloat(amount),
    frequency, // 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly'
    new Date(startDate),
    endDate ? new Date(endDate) : '',
    '',
    nextDue,
    true
  ]);
  
  return { recurId: recurId, nextDue: Utilities.formatDate(nextDue, Session.getScriptTimeZone(), 'yyyy-MM-dd') };
}

function getRecurringExpenses() {
  var user = getCurrentUser_();
  var sheet = getRecurringSheet_();
  var data = sheet.getDataRange().getValues();
  var recurrings = [];
  var now = new Date();
  
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === user && data[i][10]) { // IsActive
      var endDate = data[i][7];
      var isExpired = endDate && new Date(endDate) < now;
      
      if (!isExpired) {
        recurrings.push({
          recurId: data[i][1],
          category: data[i][2],
          description: data[i][3],
          amount: parseFloat(data[i][4]),
          frequency: data[i][5],
          startDate: Utilities.formatDate(new Date(data[i][6]), Session.getScriptTimeZone(), 'yyyy-MM-dd'),
          nextDue: Utilities.formatDate(new Date(data[i][9]), Session.getScriptTimeZone(), 'yyyy-MM-dd'),
          daysUntilDue: Math.floor((new Date(data[i][9]) - now) / (1000 * 60 * 60 * 24))
        });
      }
    }
  }
  return recurrings;
}

function updateRecurringExpense(recurId, category, description, amount, frequency) {
  var user = getCurrentUser_();
  var sheet = getRecurringSheet_();
  var data = sheet.getDataRange().getValues();
  
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === user && data[i][1] === recurId) {
      sheet.getRange(i + 1, 3).setValue(category);
      sheet.getRange(i + 1, 4).setValue(description);
      sheet.getRange(i + 1, 5).setValue(parseFloat(amount));
      sheet.getRange(i + 1, 6).setValue(frequency);
      return 'Updated';
    }
  }
  return 'Not found';
}

function deleteRecurringExpense(recurId) {
  var user = getCurrentUser_();
  var sheet = getRecurringSheet_();
  var data = sheet.getDataRange().getValues();
  
  for (var i = data.length - 1; i >= 1; i--) {
    if (data[i][0] === user && data[i][1] === recurId) {
      sheet.deleteRow(i + 1);
      return 'Deleted';
    }
  }
  return 'Not found';
}

function processRecurringExpenses() {
  var sheet = getRecurringSheet_();
  var data = sheet.getDataRange().getValues();
  var now = new Date();
  var processed = [];
  
  for (var i = 1; i < data.length; i++) {
    if (!data[i][10]) continue; // Skip inactive
    
    var nextDue = new Date(data[i][9]);
    var endDate = data[i][7];
    
    // Check if due and not expired
    if (nextDue <= now && (!endDate || new Date(endDate) > now)) {
      var user = data[i][0];
      var dateStr = Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyy-MM-dd');
      var originalUser = getCurrentUser_();
      setCurrentUser_(user);
      
      // Submit the expense
      submitExpense(
        dateStr,
        data[i][2], // category
        '[AUTO] ' + data[i][3], // description
        data[i][4], // amount
        'Online'
      );
      
      // Update next due date
      var newNextDue = calculateNextDue_(nextDue, data[i][5]);
      sheet.getRange(i + 1, 9).setValue(now); // LastProcessed
      sheet.getRange(i + 1, 10).setValue(newNextDue); // NextDue
      
      setCurrentUser_(originalUser);
      processed.push({ recurId: data[i][1], description: data[i][3], amount: data[i][4] });
    }
  }
  
  return { processed: processed, count: processed.length };
}

function calculateNextDue_(date, frequency) {
  var next = new Date(date);
  switch (frequency) {
    case 'daily': next.setDate(next.getDate() + 1); break;
    case 'weekly': next.setDate(next.getDate() + 7); break;
    case 'biweekly': next.setDate(next.getDate() + 14); break;
    case 'monthly': next.setMonth(next.getMonth() + 1); break;
    case 'quarterly': next.setMonth(next.getMonth() + 3); break;
    case 'yearly': next.setFullYear(next.getFullYear() + 1); break;
  }
  return next;
}

// ═══════════════════════════════════════════════════════════════
// BUDGET ALERTS
// ═══════════════════════════════════════════════════════════════

function getBudgetsSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Budgets');
  if (!sheet) {
    sheet = ss.insertSheet('Budgets');
    sheet.appendRow(['User', 'BudgetId', 'Category', 'LimitAmount', 'Period', 'StartDate', 'AlertThreshold', 'IsActive']);
  }
  return sheet;
}

function setBudget(category, limitAmount, period, alertThreshold) {
  var user = getCurrentUser_();
  var sheet = getBudgetsSheet_();
  var budgetId = 'BUD_' + Utilities.getUuid();
  var data = sheet.getDataRange().getValues();
  
  // Check if budget for this category already exists
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === user && data[i][2] === category) {
      // Update existing
      sheet.getRange(i + 1, 4).setValue(parseFloat(limitAmount));
      sheet.getRange(i + 1, 7).setValue(parseFloat(alertThreshold));
      return { budgetId: data[i][1], category: category, limitAmount: limitAmount };
    }
  }
  
  // Create new
  sheet.appendRow([
    user,
    budgetId,
    category,
    parseFloat(limitAmount),
    period || 'monthly', // 'monthly' | 'quarterly' | 'yearly'
    new Date(),
    parseFloat(alertThreshold) || 80, // Alert at 80% by default
    true
  ]);
  
  return { budgetId: budgetId, category: category, limitAmount: limitAmount };
}

function getBudgets() {
  var user = getCurrentUser_();
  var sheet = getBudgetsSheet_();
  var data = sheet.getDataRange().getValues();
  var budgets = [];
  
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === user && data[i][7]) { // IsActive
      budgets.push({
        budgetId: data[i][1],
        category: data[i][2],
        limitAmount: parseFloat(data[i][3]),
        period: data[i][4],
        alertThreshold: parseFloat(data[i][6])
      });
    }
  }
  return budgets;
}

function deleteBudget(budgetId) {
  var user = getCurrentUser_();
  var sheet = getBudgetsSheet_();
  var data = sheet.getDataRange().getValues();
  
  for (var i = data.length - 1; i >= 1; i--) {
    if (data[i][0] === user && data[i][1] === budgetId) {
      sheet.deleteRow(i + 1);
      return 'Deleted';
    }
  }
  return 'Not found';
}

function checkBudgetStatus() {
  var user = getCurrentUser_();
  var budgets = getBudgets();
  var expSheet = getExpenseSheet_();
  var data = expSheet.getDataRange().getValues();
  var now = new Date();
  var alerts = [];
  
  budgets.forEach(function(budget) {
    var spent = 0;
    var periodStart = getPeriodStart_(now, budget.period);
    
    for (var i = 1; i < data.length; i++) {
      var txDate = new Date(data[i][0]);
      var txCategory = data[i][1];
      if (txDate >= periodStart && txCategory === budget.category) {
        spent += parseFloat(data[i][3]) || 0;
      }
    }
    
    var percentUsed = budget.limitAmount > 0 ? (spent / budget.limitAmount) * 100 : 0;
    
    if (percentUsed >= budget.alertThreshold) {
      var status = percentUsed > 100 ? 'exceeded' : 'warning';
      alerts.push({
        category: budget.category,
        limitAmount: budget.limitAmount,
        spent: spent,
        percentUsed: Math.round(percentUsed),
        status: status,
        budgetId: budget.budgetId
      });
    }
  });
  
  return alerts;
}

function getPeriodStart_(date, period) {
  var start = new Date(date);
  switch (period) {
    case 'monthly':
      start.setDate(1);
      break;
    case 'quarterly':
      var quarter = Math.floor(start.getMonth() / 3);
      start.setMonth(quarter * 3);
      start.setDate(1);
      break;
    case 'yearly':
      start.setMonth(0);
      start.setDate(1);
      break;
  }
  start.setHours(0, 0, 0, 0);
  return start;
}

// ═══════════════════════════════════════════════════════════════
// ORIGINAL FUNCTIONS (kept for backward compatibility)
// ═══════════════════════════════════════════════════════════════

function getExpenseSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Daily Expenses');
  if (!sheet) {
    sheet = ss.insertSheet('Daily Expenses');
    sheet.appendRow(['Date','Category','Description','Amount','Payment Mode']);
  }
  return sheet;
}

function getIncomeSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Income');
  if (!sheet) {
    sheet = ss.insertSheet('Income');
    sheet.appendRow(['Date','Source','Description','Amount','Account']);
  }
  return sheet;
}

function submitExpense(date, category, description, amount, paymentMode) {
  var sheet = getExpenseSheet_();
  sheet.appendRow([new Date(date), category, description, parseFloat(amount), paymentMode]);
  return "Saved!";
}

function addIncome(date, source, description, amount, account) {
  var sheet = getIncomeSheet_();
  sheet.appendRow([new Date(date), source, description || source, parseFloat(amount), account || 'Bank']);
  return "Income added!";
}

function deleteTransaction(type, dateStr, amount, description) {
  var sheet = type === 'income' ? getIncomeSheet_() : getExpenseSheet_();
  var data = sheet.getDataRange().getValues();
  for (var i = data.length - 1; i >= 1; i--) {
    var d = new Date(data[i][0]);
    var dStr = Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    if (dStr === dateStr && parseFloat(data[i][3]) === parseFloat(amount) && data[i][2] === description) {
      sheet.deleteRow(i + 1);
      return "Deleted!";
    }
  }
  return "Not found";
}

function getUpiSettings() {
  var props = PropertiesService.getScriptProperties();
  return {
    vpa: props.getProperty('UPI_VPA') || '',
    name: props.getProperty('UPI_NAME') || ''
  };
}

function saveUpiSettings(vpa, name) {
  vpa = (vpa || '').trim();
  name = (name || '').trim();
  if (!/^[\w.\-]{2,256}@[a-zA-Z]{2,64}$/.test(vpa)) {
    throw new Error("That doesn't look like a valid UPI ID (e.g. yourname@okhdfcbank).");
  }
  var props = PropertiesService.getScriptProperties();
  props.setProperty('UPI_VPA', vpa);
  props.setProperty('UPI_NAME', name || vpa);
  return { vpa: vpa, name: name || vpa };
}

function logUpiSent(date, payeeVpa, payeeName, amount, note, category) {
  var desc = (payeeName || payeeVpa) + (note ? ' — ' + note : '');
  return submitExpense(date, category || 'UPI Payment', desc, amount, 'Online');
}

function logUpiReceived(date, payerName, amount, note) {
  var desc = (payerName || 'UPI') + (note ? ' — ' + note : '');
  return addIncome(date, 'UPI Received', desc, amount, 'Bank');
}

function getDashboardData(targetMonthYear) {
  var expSheet = getExpenseSheet_();
  var incSheet = getIncomeSheet_();
  var now = new Date();
  var currentMonthKey = monthKey_(now);
  var targetKey = targetMonthYear || currentMonthKey;
  var prevMonth = new Date(now.getFullYear(), now.getMonth()-1, 1);
  var prevMonthKey = monthKey_(prevMonth);

  var result = {
    balance: 0, totalIncome: 0, totalExpenses: 0,
    currentSpent: 0, currentIncome: 0, prevMonthSpent: 0,
    selectedSpent: 0, selectedIncome: 0, monthTxCount: 0,
    selectedMonthName: targetKey,
    recentTx: [], allTx: [],
    categoryBreakdown: {}, incomeCategoryBreakdown: {},
    dailySpending: {}, dailyIncome: {},
    biggestExpense: null, biggestIncome: null,
    insights: [], trends: [],
    todayStr: Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyy-MM-dd'),
    budgetAlerts: []
  };

  var parts = targetKey.split(' ');
  var ty = parseInt(parts[1]);
  var tmIdx = monthNameToIdx_(parts[0]);
  var daysInMonth = new Date(ty, tmIdx+1, 0).getDate();
  for(var d=1; d<=daysInMonth; d++){ result.dailySpending[d] = 0; result.dailyIncome[d] = 0; }

  var allTx = [], monthExpenses = [], monthIncomes = [];

  var edata = expSheet.getDataRange().getValues();
  for (var i=1; i<edata.length; i++) {
    var date = new Date(edata[i][0]);
    var amt = parseFloat(edata[i][3]);
    if (isNaN(date.getTime()) || isNaN(amt)) continue;
    result.totalExpenses += amt;
    var mk = monthKey_(date);
    if (mk === currentMonthKey) { result.currentSpent += amt; result.monthTxCount += 1; }
    if (mk === prevMonthKey) result.prevMonthSpent += amt;
    if (mk === targetKey) {
      result.selectedSpent += amt;
      var cat = edata[i][1];
      result.categoryBreakdown[cat] = (result.categoryBreakdown[cat] || 0) + amt;
      result.dailySpending[date.getDate()] = (result.dailySpending[date.getDate()] || 0) + amt;
      monthExpenses.push({amount:amt, desc:edata[i][2], cat:cat, date:date});
    }
    allTx.push({
      type:'expense', dateMs:date.getTime(),
      dateStr: Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd'),
      category:edata[i][1], description:edata[i][2], amount:amt, mode:edata[i][4]
    });
  }

  var idata = incSheet.getDataRange().getValues();
  for (var j=1; j<idata.length; j++) {
    var idt = new Date(idata[j][0]);
    var ia = parseFloat(idata[j][3]);
    if (isNaN(idt.getTime()) || isNaN(ia)) continue;
    result.totalIncome += ia;
    var imk = monthKey_(idt);
    if (imk === currentMonthKey) { result.currentIncome += ia; result.monthTxCount += 1; }
    if (imk === targetKey) {
      result.selectedIncome += ia;
      var icat = idata[j][1];
      result.incomeCategoryBreakdown[icat] = (result.incomeCategoryBreakdown[icat] || 0) + ia;
      result.dailyIncome[idt.getDate()] = (result.dailyIncome[idt.getDate()] || 0) + ia;
      monthIncomes.push({amount:ia, desc:idata[j][2], cat:icat, date:idt});
    }
    allTx.push({
      type:'income', dateMs:idt.getTime(),
      dateStr: Utilities.formatDate(idt, Session.getScriptTimeZone(), 'yyyy-MM-dd'),
      category:idata[j][1], description:idata[j][2], amount:ia, mode:idata[j][4]
    });
  }

  result.balance = result.totalIncome - result.totalExpenses;
  allTx.sort(function(a,b){return b.dateMs - a.dateMs;});
  result.recentTx = allTx.slice(0, 10);
  result.allTx = allTx.slice(0, 200);

  monthExpenses.sort(function(a,b){return b.amount - a.amount;});
  if (monthExpenses.length) {
    result.biggestExpense = {
      amount: monthExpenses[0].amount,
      desc: monthExpenses[0].desc,
      cat: monthExpenses[0].cat,
      dateStr: Utilities.formatDate(monthExpenses[0].date, Session.getScriptTimeZone(), 'yyyy-MM-dd')
    };
  }
  monthIncomes.sort(function(a,b){return b.amount - a.amount;});
  if (monthIncomes.length) {
    result.biggestIncome = {
      amount: monthIncomes[0].amount,
      desc: monthIncomes[0].desc,
      cat: monthIncomes[0].cat,
      dateStr: Utilities.formatDate(monthIncomes[0].date, Session.getScriptTimeZone(), 'yyyy-MM-dd')
    };
  }

  result.trends = buildTrends_(edata, idata, now);
  result.insights = generateInsights_(result, now, daysInMonth);
  result.budgetAlerts = checkBudgetStatus();

  return result;
}

function buildTrends_(edata, idata, now) {
  var trends = [];
  for (var m=5; m>=0; m--) {
    var d = new Date(now.getFullYear(), now.getMonth()-m, 1);
    var key = monthKey_(d);
    var shortLabel = d.toLocaleString('default',{month:'short'});
    var spent = 0, income = 0;
    for (var i=1; i<edata.length; i++) {
      var dt = new Date(edata[i][0]);
      if (!isNaN(dt.getTime()) && monthKey_(dt) === key) spent += parseFloat(edata[i][3]) || 0;
    }
    for (var j=1; j<idata.length; j++) {
      var idt = new Date(idata[j][0]);
      if (!isNaN(idt.getTime()) && monthKey_(idt) === key) income += parseFloat(idata[j][3]) || 0;
    }
    trends.push({label: shortLabel, spent: spent, income: income});
  }
  return trends;
}

function generateInsights_(data, now, daysInMonth) {
  var insights = [];
  var today = now.getDate();
  var isCurrentMonth = (data.selectedMonthName === monthKey_(now));

  if (isCurrentMonth && data.currentSpent > 0 && today > 1) {
    var projected = Math.round((data.currentSpent / today) * daysInMonth);
    insights.push({
      type:'forecast', icon:'🔮', title:'Month-end forecast',
      text:'At this pace you\'ll spend ≈ ₹' + projected.toLocaleString('en-IN') + ' by month-end.'
    });
    if (data.prevMonthSpent > 0) {
      var diff = projected - data.prevMonthSpent;
      var pct = Math.round((diff / data.prevMonthSpent) * 100);
      if (pct > 10) insights.push({type:'warn', icon:'⚠️', title:'Spending is up', text:'On track for '+pct+'% more than last month.'});
      else if (pct < -10) insights.push({type:'good', icon:'🎉', title:'Great control', text:Math.abs(pct)+'% less than last month — keep it up!'});
    }
  }

  if (data.selectedIncome > 0) {
    var saved = data.selectedIncome - data.selectedSpent;
    var rate = Math.round((saved / data.selectedIncome) * 100);
    if (rate >= 20) insights.push({type:'good', icon:'💰', title:'Strong savings', text:'You\'ve saved '+rate+'% of income this month.'});
    else if (rate < 0) insights.push({type:'warn', icon:'🚨', title:'Overspending', text:'Expenses exceed income by ₹'+Math.abs(saved).toLocaleString('en-IN')+'.'});
    else if (rate < 10) insights.push({type:'info', icon:'📉', title:'Low savings rate', text:'Only '+rate+'% saved — aim for 20%+.'});
  }

  var topCat = null, topAmt = 0;
  for (var cat in data.categoryBreakdown) if (data.categoryBreakdown[cat] > topAmt) { topAmt = data.categoryBreakdown[cat]; topCat = cat; }
  if (topCat && data.selectedSpent > 0) {
    var pc = Math.round((topAmt / data.selectedSpent) * 100);
    insights.push({type:'info', icon:'🎯', title:'Biggest category', text:pc+'% goes to '+topCat+' (₹'+Math.round(topAmt).toLocaleString('en-IN')+').'});
  }

  if (isCurrentMonth) {
    var noSpendDays = 0;
    for (var day=1; day<=today; day++) if (!data.dailySpending[day]) noSpendDays++;
    if (noSpendDays >= 3) insights.push({type:'good', icon:'🔥', title:'No-spend streak', text:noSpendDays+' no-spend days this month!'});
  }

  return insights;
}

function monthKey_(d) { return d.toLocaleString('default', { month: 'long', year: 'numeric' }); }
function monthNameToIdx_(n) {
  var m = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  return m.indexOf(n);
}

function getFinancialData(t) { return getDashboardData(t); }
function getExpenseData(t) { return getDashboardData(t); }

function parseSmsSeverSide(sms) {
  if (!sms) return null;
  var lower = sms.toLowerCase();
  if (/credited|received|deposited/.test(lower) && !/debited|paid|payment/.test(lower)) return null;
  var amount = null;
  var amtPatterns = [/(?:rs\.?|inr\.?|₹)\s*([0-9,]+(?:\.[0-9]{1,2})?)/i, /debited.*?(?:rs\.?|inr\.?|₹)?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i];
  for (var i = 0; i < amtPatterns.length; i++) {
    var m = sms.match(amtPatterns[i]);
    if (m) { amount = parseFloat(m[1].replace(/,/g,'')); break; }
  }
  if (!amount) return null;
  var date = new Date().toISOString().split('T')[0];
  var dm = sms.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (dm) { var y = dm[3].length===2?'20'+dm[3]:dm[3]; date = y+'-'+String(dm[2]).padStart(2,'0')+'-'+String(dm[1]).padStart(2,'0'); }
  var merchant = 'SMS Expense';
  var mm = sms.match(/(?:\bat\b|\bto\b|\bmerchant\b)\s+([A-Za-z0-9][A-Za-z0-9\s&'.]{1,25}?)(?:\s+on\b|\s+via\b|[,.]|$)/i);
  if (mm && mm[1] && mm[1].trim().length > 1) merchant = mm[1].trim();
  var brands = sms.match(/swiggy|zomato|amazon|flipkart|uber|ola|rapido|bigbasket|blinkit|zepto|dominos|dmart/i);
  if (brands && merchant === 'SMS Expense') merchant = brands[0].charAt(0).toUpperCase() + brands[0].slice(1).toLowerCase();
  var payMode = 'Online';
  if (/card|visa|mastercard|rupay/i.test(sms)) payMode = 'Card';
  else if (/cash|atm/i.test(lower)) payMode = 'Cash';
  var category = 'Other';
  var search = merchant.toLowerCase() + ' ' + lower;
  if (/swiggy|zomato|pizza|burger|food|restaurant|cafe|biryani|domino/.test(search)) category = 'Dinner';
  else if (/bigbasket|blinkit|zepto|dmart|grocery|supermarket|jiomart/.test(search)) category = 'Groceries';
  else if (/uber|ola|rapido|metro|petrol|fuel|irctc|flight|bus|cab/.test(search)) category = 'Transport';
  return { date:date, amount:String(amount), description:merchant, category:category, paymentMode:payMode };
}
