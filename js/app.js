initializeStorage();

// -------------------- LOGIN --------------------
const loginForm = document.getElementById("loginForm");

if (loginForm) {
    const loginMessage = document.getElementById("loginMessage");

    loginForm.addEventListener("submit", function (event) {
        event.preventDefault();

        const username = document.getElementById("username").value.trim().toLowerCase();
        const password = document.getElementById("password").value;
        const employees = getEmployees();
        const adminUser = getAdmin();

        const employee = employees.find(function (item) {
            return item.username.toLowerCase() === username && item.password === password;
        });

        if (username === adminUser.username.toLowerCase() && password === adminUser.password) {
            setCurrentUser(adminUser);
            window.location.href = "admin-dashboard.html";
        } else if (employee) {
            setCurrentUser(employee);
            syncEmployeeEntitlements(employee);
            window.location.href = "employee-dashboard.html";
        } else {
            loginMessage.textContent = "Invalid username or password.";
        }
    });
}

// -------------------- EMPLOYEE REQUEST FORM --------------------
const leaveForm = document.getElementById("leaveForm");

if (leaveForm) {
    const currentUser = getCurrentUser();

    if (!currentUser || currentUser.role !== "employee") {
        window.location.href = "index.html";
    } else {
        syncEmployeeEntitlements(currentUser);
        setupLeaveRequestForm(currentUser);
    }
}

function setupLeaveRequestForm(currentUser) {
    const calculateButton = document.getElementById("calculateButton");
    const submitButton = document.getElementById("submitButton");
    const cancelButton = document.getElementById("cancelButton");
    const message = document.getElementById("message");
    const leavePreview = document.getElementById("leavePreview");
    const leaveTypeInput = document.getElementById("leaveType");
    const startDateInput = document.getElementById("startDate");
    const endDateInput = document.getElementById("endDate");
    const reasonInput = document.getElementById("reason");
    const documentInput = document.getElementById("supportingDocument");

    let calculatedLeave = null;

    // Any change invalidates the previous calculation so stale previews cannot be submitted.
    [leaveTypeInput, startDateInput, endDateInput, reasonInput, documentInput].forEach(function (input) {
        input.addEventListener("change", invalidatePreview);
        input.addEventListener("input", invalidatePreview);
    });

    function invalidatePreview() {
        calculatedLeave = null;
        submitButton.style.display = "none";
        leavePreview.innerHTML = "";
    }

    calculateButton.addEventListener("click", async function () {
        message.textContent = "";
        invalidatePreview();

        const leaveType = leaveTypeInput.value;
        const startDate = startDateInput.value;
        const endDate = endDateInput.value;
        const reason = reasonInput.value.trim();
        const supportingDocument = documentInput.files[0];

        if (!leaveType || !startDate || !endDate || !reason) {
            message.textContent = "Please complete all required fields.";
            return;
        }

        if (!isValidDateString(startDate) || !isValidDateString(endDate)) {
            message.textContent = "Please enter valid start and end dates.";
            return;
        }

        if (endDate < startDate) {
            message.textContent = "The end date cannot be before the start date.";
            return;
        }

        if (startDate < getLocalDateString(new Date())) {
            message.textContent = "You cannot request leave for dates in the past.";
            return;
        }

        if ((leaveType === "sick" || leaveType === "maternity") && !supportingDocument) {
            message.textContent = "A supporting document is required for this leave type.";
            return;
        }

        if (supportingDocument && !isAllowedDocument(supportingDocument.name)) {
            message.textContent = "Please attach a PDF, Word document, JPG or PNG file.";
            return;
        }

        try {
            const workingDays = await calculateWorkingDays(startDate, endDate);

            if (workingDays <= 0) {
                message.textContent = "The selected dates contain no working days.";
                return;
            }

            syncEmployeeEntitlements(currentUser);
            const employeeBalance = getEmployeeBalance(currentUser.employeeId);
            if (!employeeBalance) {
                message.textContent = "Your leave balances could not be found. Please contact HR.";
                return;
            }

            const requests = getLeaveRequests();
            const eligibility = validateLeaveRequest(leaveType, currentUser, startDate, endDate, workingDays, requests);
            if (!eligibility.valid) {
                message.textContent = eligibility.message;
                return;
            }

            const balanceInfo = getLeaveAvailability(leaveType, currentUser, employeeBalance, requests, startDate);
            if (leaveType !== "unpaid" && workingDays > balanceInfo.available) {
                message.textContent = "You do not have enough " + getLeaveTypeName(leaveType).toLowerCase() +
                    " available. Available balance for this request: " + formatDays(balanceInfo.available) + " days.";
                return;
            }

            const maternityPayRate = leaveType === "maternity"
                ? (getCompletedMonths(currentUser.employmentStartDate) >= 12 ? 75 : 0)
                : null;
            const remunerationPercent = leaveType === "parental"
                ? 75
                : (leaveType === "maternity" ? maternityPayRate : null);

            calculatedLeave = {
                leaveType: leaveType,
                startDate: startDate,
                endDate: endDate,
                workingDays: workingDays,
                reason: reason,
                supportingDocument: supportingDocument ? supportingDocument.name : "",
                maternityPayRate: maternityPayRate,
                remunerationPercent: remunerationPercent,
                balanceAtCalculation: balanceInfo.available
            };

            renderLeavePreview(calculatedLeave, balanceInfo, employeeBalance);
            submitButton.style.display = "inline-block";
        } catch (error) {
            message.textContent = "Public holiday information could not be retrieved. Please try again.";
            console.error("Leave calculation failed:", error);
        }
    });

    submitButton.addEventListener("click", function () {
        message.textContent = "";

        if (!calculatedLeave) {
            message.textContent = "Please calculate and review your leave before submitting.";
            return;
        }

        // Re-check rules at submission time because localStorage may have changed since calculation.
        const latestRequests = getLeaveRequests();
        const latestBalance = getEmployeeBalance(currentUser.employeeId);
        const eligibility = validateLeaveRequest(
            calculatedLeave.leaveType,
            currentUser,
            calculatedLeave.startDate,
            calculatedLeave.endDate,
            calculatedLeave.workingDays,
            latestRequests
        );

        if (!eligibility.valid) {
            message.textContent = eligibility.message;
            invalidatePreview();
            return;
        }

        const balanceInfo = getLeaveAvailability(
            calculatedLeave.leaveType,
            currentUser,
            latestBalance,
            latestRequests,
            calculatedLeave.startDate
        );

        if (calculatedLeave.leaveType !== "unpaid" && calculatedLeave.workingDays > balanceInfo.available) {
            message.textContent = "Your available balance has changed. Please calculate your leave again.";
            invalidatePreview();
            return;
        }

        const newRequest = {
            requestId: "REQ" + Date.now(),
            employeeId: currentUser.employeeId,
            leaveType: calculatedLeave.leaveType,
            startDate: calculatedLeave.startDate,
            endDate: calculatedLeave.endDate,
            workingDays: calculatedLeave.workingDays,
            reason: calculatedLeave.reason,
            supportingDocument: calculatedLeave.supportingDocument,
            status: "Pending",
            submittedDate: new Date().toISOString(),
            decisionDate: null,
            rejectionReason: null,
            cancelledDate: null,
            maternityPayRate: calculatedLeave.maternityPayRate,
            remunerationPercent: calculatedLeave.remunerationPercent
        };

        latestRequests.push(newRequest);
        submitButton.disabled = true;
        localStorage.setItem("leaveRequests", JSON.stringify(latestRequests));
        alert("Leave request submitted successfully. Your balance will only change if the request is approved.");
        window.location.href = "leave-history.html";
    });

    cancelButton.addEventListener("click", function () {
        window.location.href = "employee-dashboard.html";
    });
}

function renderLeavePreview(request, balanceInfo, employeeBalance) {
    const leavePreview = document.getElementById("leavePreview");
    const safeReason = escapeHtml(request.reason);
    const safeDocument = escapeHtml(request.supportingDocument || "None");
    let balanceRows = "";

    if (request.leaveType === "annual") {
        balanceRows = `
            <p><strong>Current balance:</strong> ${formatDays(employeeBalance.annual)} days</p>
            <p><strong>Future accrual before leave:</strong> ${formatDays(balanceInfo.futureAccrual)} days</p>
            <p><strong>Pending annual leave reserved:</strong> ${formatDays(balanceInfo.pendingDays)} days</p>
            <p><strong>Projected balance available before this request:</strong> ${formatDays(balanceInfo.available)} days</p>
            <p><strong>Requested days:</strong> ${request.workingDays}</p>
            <p><strong>Projected balance after request:</strong> ${formatDays(balanceInfo.available - request.workingDays)} days</p>`;
    } else if (request.leaveType === "maternity") {
        const payText = request.maternityPayRate === 75 ? "75% remuneration" : "Unpaid (less than 12 months of service)";
        balanceRows = `<p><strong>Maternity leave pay category:</strong> ${payText}</p>
            <p><strong>Entitlement:</strong> ${employeeBalance.maternity} working days</p>`;
    } else if (request.leaveType === "parental") {
        balanceRows = `<p><strong>Remuneration:</strong> 75%</p>
            <p><strong>Current balance:</strong> ${formatDays(employeeBalance.parental)} days</p>
            <p><strong>Available balance:</strong> ${formatDays(balanceInfo.available)} days</p>`;
    } else if (request.leaveType === "unpaid") {
        balanceRows = `<p><strong>Balance:</strong> 0 days (unpaid leave is reviewed by management)</p>`;
    } else {
        balanceRows = `<p><strong>Current balance:</strong> ${formatDays(employeeBalance[request.leaveType])} days</p>
            <p><strong>Pending requests reserved:</strong> ${formatDays(balanceInfo.pendingDays)} days</p>
            <p><strong>Available balance:</strong> ${formatDays(balanceInfo.available)} days</p>
            <p><strong>Balance after this request:</strong> ${formatDays(balanceInfo.available - request.workingDays)} days</p>`;
    }

    leavePreview.innerHTML = `
        <section class="employee-information">
            <h2>Leave Request Preview</h2>
            <p><strong>Leave type:</strong> ${getLeaveTypeName(request.leaveType)}</p>
            <p><strong>Start date:</strong> ${request.startDate}</p>
            <p><strong>End date:</strong> ${request.endDate}</p>
            <p><strong>Working days:</strong> ${request.workingDays}</p>
            ${balanceRows}
            <p><strong>Reason:</strong> ${safeReason}</p>
            <p><strong>Supporting document:</strong> ${safeDocument}</p>
            <p><em>This request will remain pending until an administrator makes a decision.</em></p>
        </section>`;
}

// -------------------- LEAVE RULES --------------------
function validateLeaveRequest(leaveType, employee, startDate, endDate, workingDays, requests) {
    const allowedTypes = ["annual", "sick", "maternity", "parental", "familyResponsibility", "study", "birthday", "unpaid"];
    if (!allowedTypes.includes(leaveType)) {
        return { valid: false, message: "Please select a valid leave type." };
    }

    if (hasOverlappingLeave(employee.employeeId, startDate, endDate, requests)) {
        return { valid: false, message: "These dates overlap with an existing pending or approved leave request." };
    }

    const completedMonths = getCompletedMonths(employee.employmentStartDate);

    if (leaveType === "maternity" && String(employee.gender || "").toLowerCase() !== "female") {
        return { valid: false, message: "Maternity leave is only available to female employees." };
    }

    if (leaveType === "maternity") {
        const maternityDaysAlreadyUsedOrRequested = requests.filter(function (request) {
            return request.employeeId === employee.employeeId && request.leaveType === "maternity" &&
                request.status !== "Rejected" && request.status !== "Cancelled";
        }).reduce(function (sum, request) { return sum + Number(request.workingDays || 0); }, 0);

        if (maternityDaysAlreadyUsedOrRequested + workingDays > 120) {
            return { valid: false, message: "Your maternity leave requests cannot exceed 120 working days in total." };
        }
    }

    if (leaveType === "birthday") {
        if (!employee.dateOfBirth) {
            return { valid: false, message: "Your date of birth is missing. Please contact HR." };
        }

        const birthMonth = Number(employee.dateOfBirth.slice(5, 7));
        const startMonth = Number(startDate.slice(5, 7));
        const endMonth = Number(endDate.slice(5, 7));
        if (startMonth !== birthMonth || endMonth !== birthMonth || startDate.slice(0, 4) !== endDate.slice(0, 4)) {
            return { valid: false, message: "Birthday leave must be taken within your birthday month and one calendar year." };
        }
        if (workingDays !== 1 || startDate !== endDate) {
            return { valid: false, message: "Birthday leave must be requested for one working day only." };
        }
        const birthdayUsed = requests.some(function (request) {
            return request.employeeId === employee.employeeId && request.leaveType === "birthday" &&
                request.status !== "Rejected" && request.status !== "Cancelled" &&
                request.startDate.slice(0, 4) === startDate.slice(0, 4);
        });
        if (birthdayUsed) {
            return { valid: false, message: "You have already used or requested birthday leave for this year." };
        }
    }

    // Annual-cycle leave types must stay within one calendar year so the correct year's entitlement is used.
    if (["parental", "familyResponsibility", "study"].includes(leaveType) && startDate.slice(0, 4) !== endDate.slice(0, 4)) {
        return { valid: false, message: "This leave type must be requested within one calendar year. Please submit separate requests if needed." };
    }

    if (["parental", "familyResponsibility", "study"].includes(leaveType)) {
        const alreadyRequested = requests.filter(function (request) {
            return request.employeeId === employee.employeeId && request.leaveType === leaveType &&
                request.startDate.slice(0, 4) === startDate.slice(0, 4) &&
                request.status !== "Rejected" && request.status !== "Cancelled";
        }).reduce(function (sum, request) { return sum + request.workingDays; }, 0);

        const yearlyLimits = { parental: 10, familyResponsibility: 3, study: 10 };
        if (alreadyRequested + workingDays > yearlyLimits[leaveType]) {
            return { valid: false, message: "This request exceeds your yearly " + getLeaveTypeName(leaveType).toLowerCase() + " entitlement of " + yearlyLimits[leaveType] + " days." };
        }
    }

    if (leaveType === "maternity" && workingDays > 120) {
        return { valid: false, message: "Maternity leave cannot exceed 120 working days." };
    }

    if (leaveType === "sick" && completedMonths < 3) {
        // Before 3 months, the employee can use the initial 5-day entitlement.
        // The balance check below enforces that limit.
    }

    return { valid: true, message: "" };
}

function getLeaveAvailability(leaveType, employee, balance, requests, requestStartDate) {
    const pendingDays = requests.filter(function (request) {
        return request.employeeId === employee.employeeId && request.leaveType === leaveType && request.status === "Pending";
    }).reduce(function (sum, request) { return sum + Number(request.workingDays || 0); }, 0);

    if (leaveType === "annual") {
        const futureAccrual = getFutureAnnualAccrual(employee, balance, requestStartDate);
        const projected = Math.min(35, Number(balance.annual || 0) + futureAccrual);
        return {
            current: Number(balance.annual || 0),
            futureAccrual: futureAccrual,
            projected: projected,
            pendingDays: pendingDays,
            available: Math.max(0, projected - pendingDays)
        };
    }

    if (leaveType === "unpaid") {
        return { current: 0, futureAccrual: 0, projected: 0, pendingDays: pendingDays, available: Infinity };
    }

    return {
        current: Number(balance[leaveType] || 0),
        futureAccrual: 0,
        projected: Number(balance[leaveType] || 0),
        pendingDays: pendingDays,
        available: Math.max(0, Number(balance[leaveType] || 0) - pendingDays)
    };
}

// -------------------- ENTITLEMENT UPDATES --------------------
function syncEmployeeEntitlements(employee, todayValue) {
    if (!employee || employee.role !== "employee") return;

    const balances = getLeaveBalances();
    let balance = balances.find(function (item) { return item.employeeId === employee.employeeId; });
    if (!balance) {
        balance = {
            employeeId: employee.employeeId,
            annual: 0,
            sick: 5,
            maternity: 120,
            parental: 10,
            familyResponsibility: 3,
            study: 10,
            birthday: 1,
            unpaid: 0
        };
        balances.push(balance);
    }

    const today = todayValue || new Date();
    const currentYear = today.getFullYear();

    // Annual leave accrues on the 25th. Staff joining after the 10th begin accruing the following month.
    if (!balance.annualAccruedThrough) {
        balance.annualAccruedThrough = employee.employmentStartDate;
    }
    const employmentStart = parseLocalDate(employee.employmentStartDate);
    const marker = parseLocalDate(balance.annualAccruedThrough);
    let year = employmentStart.getFullYear();
    let month = employmentStart.getMonth();
    const lastMonth = today.getFullYear() * 12 + today.getMonth();

    while (year * 12 + month <= lastMonth) {
        const accrualDate = new Date(year, month, 25);
        const isStartMonth = year === employmentStart.getFullYear() && month === employmentStart.getMonth();
        const eligibleStartMonth = employeeStartDay(employee.employmentStartDate) <= 10;

        if ((!isStartMonth || eligibleStartMonth) && accrualDate > marker && accrualDate <= today) {
            balance.annual = Math.min(35, roundDays(Number(balance.annual || 0) + 1.67));
            balance.annualAccruedThrough = getLocalDateString(accrualDate);
        }

        month++;
        if (month > 11) { month = 0; year++; }
    }

    // Set the cycle marker once, then reset annual-cycle entitlements at the start of a new year.
    if (!balance.entitlementYear) {
        balance.entitlementYear = currentYear;
    } else if (Number(balance.entitlementYear) < currentYear) {
        balance.parental = 10;
        balance.familyResponsibility = 3;
        balance.study = 10;
        balance.birthday = 1;
        balance.entitlementYear = currentYear;
    }

    // Sick leave starts at 5 days and becomes a 30-day entitlement after three completed months.
    if (getCompletedMonths(employee.employmentStartDate, today) >= 3 && !balance.sickEntitlementUpdated) {
        balance.sick = 30;
        balance.sickEntitlementUpdated = true;
    }

    localStorage.setItem("leaveBalances", JSON.stringify(balances));
}

function getFutureAnnualAccrual(employee, balance, requestStartDate) {
    const start = parseLocalDate(getLocalDateString(new Date()));
    const end = parseLocalDate(requestStartDate);
    if (end <= start) return 0;

    let accrual = 0;
    let year = start.getFullYear();
    let month = start.getMonth();
    const marker = balance.annualAccruedThrough ? parseLocalDate(balance.annualAccruedThrough) : start;
    const employmentStart = parseLocalDate(employee.employmentStartDate);

    while (year * 12 + month <= end.getFullYear() * 12 + end.getMonth()) {
        const accrualDate = new Date(year, month, 25);
        const isStartMonth = year === employmentStart.getFullYear() && month === employmentStart.getMonth();
        if ((!isStartMonth || employeeStartDay(employee.employmentStartDate) <= 10) && accrualDate > marker && accrualDate > start && accrualDate <= end) {
            accrual += 1.67;
        }
        month++;
        if (month > 11) { month = 0; year++; }
    }

    return roundDays(Math.min(accrual, Math.max(0, 35 - Number(balance.annual || 0))));
}

// -------------------- SHARED HELPERS --------------------
function getEmployeeBalance(employeeId) {
    return getLeaveBalances().find(function (balance) { return balance.employeeId === employeeId; });
}

function getCompletedMonths(startDate, todayValue) {
    const start = parseLocalDate(startDate);
    const today = todayValue || new Date();
    let months = (today.getFullYear() - start.getFullYear()) * 12 + today.getMonth() - start.getMonth();
    if (today.getDate() < start.getDate()) months--;
    return months;
}

function employeeStartDay(startDate) {
    return parseLocalDate(startDate).getDate();
}

function hasOverlappingLeave(employeeId, startDate, endDate, requests) {
    return requests.some(function (request) {
        const active = request.status === "Pending" || request.status === "Approved";
        return request.employeeId === employeeId && active && startDate <= request.endDate && endDate >= request.startDate;
    });
}

function getLeaveTypeName(leaveType) {
    const names = {
        annual: "Annual Leave",
        sick: "Sick Leave",
        maternity: "Maternity Leave",
        parental: "Parental Leave",
        familyResponsibility: "Family Responsibility Leave",
        study: "Study Leave",
        birthday: "Birthday Leave",
        unpaid: "Unpaid Leave"
    };
    return names[leaveType] || "Unknown Leave Type";
}

async function calculateWorkingDays(startDate, endDate) {
    const start = parseLocalDate(startDate);
    const end = parseLocalDate(endDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
        throw new Error("Invalid date range");
    }

    const years = [];
    for (let year = start.getFullYear(); year <= end.getFullYear(); year++) years.push(year);
    const holidays = new Set();

    for (const year of years) {
        const response = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/ZA`);
        if (!response.ok) throw new Error("Holiday API failed for " + year);
        const data = await response.json();
        data.forEach(function (holiday) { holidays.add(holiday.date); });
    }

    let workingDays = 0;
    const current = new Date(start);
    while (current <= end) {
        const day = current.getDay();
        const dateString = getLocalDateString(current);
        if (day !== 0 && day !== 6 && !holidays.has(dateString)) workingDays++;
        current.setDate(current.getDate() + 1);
    }
    return workingDays;
}

function parseLocalDate(value) {
    const parts = value.split("-").map(Number);
    return new Date(parts[0], parts[1] - 1, parts[2]);
}

function getLocalDateString(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function isValidDateString(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = parseLocalDate(value);
    return getLocalDateString(date) === value;
}

function isAllowedDocument(fileName) {
    return /\.(pdf|doc|docx|jpg|jpeg|png)$/i.test(fileName);
}

function roundDays(value) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
}

function formatDays(value) {
    return roundDays(Number(value || 0)).toFixed(2).replace(/\.00$/, "");
}

function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (character) {
        const replacements = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
        return replacements[character];
    });
}
