initializeStorage();

const loginForm = document.getElementById("loginForm");

if (loginForm) {

    const loginMessage = document.getElementById("loginMessage");

    loginForm.addEventListener("submit", function (event) {
        event.preventDefault();

        const username =
            document.getElementById("username").value;

        const password =
            document.getElementById("password").value;

        const employees = getEmployees();
        const admin = getAdmin();

        const employee = employees.find(function (employee) {
            return employee.username === username &&
                employee.password === password;
        });

        if (username === admin.username &&
            password === admin.password) {

            setCurrentUser(admin);
            window.location.href = "admin-dashboard.html";

        } else if (employee) {

            setCurrentUser(employee);
            window.location.href = "employee-dashboard.html";

        } else {

            loginMessage.textContent =
                "Invalid username or password.";
        }
    });
}

const leaveForm = document.getElementById("leaveForm");

if (leaveForm) {

    const currentUser = getCurrentUser();

    if (!currentUser || currentUser.role !== "employee") {
        window.location.href = "index.html";
    }

    const calculateButton =
        document.getElementById("calculateButton");

    const submitButton =
        document.getElementById("submitButton");

    const cancelButton =
        document.getElementById("cancelButton");

    const message =
        document.getElementById("message");

    const leavePreview =
        document.getElementById("leavePreview");

    let calculatedLeave = null;

    calculateButton.addEventListener("click", async function () {

        message.textContent = "";
        leavePreview.innerHTML = "";
        submitButton.style.display = "none";

        const leaveType =
            document.getElementById("leaveType").value;

        const startDate =
            document.getElementById("startDate").value;

        const endDate =
            document.getElementById("endDate").value;

        const reason =
            document.getElementById("reason").value.trim();

        const supportingDocument =
            document.getElementById("supportingDocument").files[0];

        if (!leaveType || !startDate || !endDate || !reason) {
            message.textContent =
                "Please complete all required fields.";

            return;
        }

        if (new Date(endDate) < new Date(startDate)) {
            message.textContent =
                "The end date cannot be before the start date.";

            return;
        }

        if (
            (leaveType === "sick" ||
                leaveType === "maternity") &&
            !supportingDocument
        ) {
            message.textContent =
                "A supporting document is required for this leave type.";

            return;
        }

        try {

            const workingDays =
                await calculateWorkingDays(startDate, endDate);

            if (workingDays <= 0) {
                message.textContent =
                    "The selected dates contain no working days.";

                return;
            }


            const balances = getLeaveBalances();

            const employeeBalance = balances.find(function (balance) {
                return balance.employeeId === currentUser.employeeId;
            });

            if (!employeeBalance) {
                message.textContent = "Your leave balances could not be found.";
                return;
            }

            const leaveRequests = getLeaveRequests();

            // Check eligibility for this leave type.
            const eligibilityMessage =
                validateLeaveEligibility(leaveType, currentUser);

            if (eligibilityMessage) {
                message.textContent = eligibilityMessage;
                return;
            }

            // Prevent overlapping pending or approved requests.
            if (
                hasOverlappingLeave(
                    currentUser.employeeId,
                    startDate,
                    endDate,
                    leaveRequests
                )
            ) {
                message.textContent =
                    "These dates overlap with an existing pending or approved leave request.";
                return;
            }

            // Calculate the days already requested but not yet approved.
            const pendingDays = leaveRequests
                .filter(function (request) {
                    return request.employeeId === currentUser.employeeId &&
                        request.leaveType === leaveType &&
                        request.status === "Pending";
                })
                .reduce(function (total, request) {
                    return total + request.workingDays;
                }, 0);

            const availableBalance =
                employeeBalance[leaveType] - pendingDays;

            // Unpaid leave has no fixed balance limit.
            if (
                leaveType !== "unpaid" &&
                workingDays > availableBalance
            ) {
                message.textContent =
                    `You do not have enough ${getLeaveTypeName(leaveType)} available. ` +
                    `Available balance: ${availableBalance} days.`;

                return;
            }

            calculatedLeave = {
                leaveType: leaveType,
                startDate: startDate,
                endDate: endDate,
                workingDays: workingDays,
                reason: reason,
                supportingDocument:
                    supportingDocument
                        ? supportingDocument.name
                        : ""
            };

            leavePreview.innerHTML = `
                <h2>Leave Request Preview</h2>

                <p>
                    <strong>Leave Type:</strong>
                    ${getLeaveTypeName(leaveType)}
                </p>

                <p>
                    <strong>Start Date:</strong>
                    ${startDate}
                </p>

                <p>
                    <strong>End Date:</strong>
                    ${endDate}
                </p>

                <p>
                    <strong>Working Days:</strong>
                    ${workingDays}
                </p>

                <p>
                    <strong>Current Balance:</strong>
                    ${employeeBalance[leaveType]} days
                </p>

                <p>
                    <strong>Reason:</strong>
                    ${reason}
                </p>

                <p>
                    <strong>Supporting Document:</strong>
                    ${supportingDocument
                    ? supportingDocument.name
                    : "None"}
                </p>
            `;

            submitButton.style.display = "inline-block";

        } catch (error) {

            message.textContent =
                "Public holiday information could not be retrieved. Please try again.";

            console.error(error);
        }
    });

    submitButton.addEventListener("click", function () {

        if (!calculatedLeave) {
            return;
        }

        const leaveRequests = getLeaveRequests();

        const newRequest = {
            requestId: "REQ" + Date.now(),
            employeeId: currentUser.employeeId,
            leaveType: calculatedLeave.leaveType,
            startDate: calculatedLeave.startDate,
            endDate: calculatedLeave.endDate,
            workingDays: calculatedLeave.workingDays,
            reason: calculatedLeave.reason,
            supportingDocument:
                calculatedLeave.supportingDocument,
            status: "Pending",
            submittedDate: new Date().toISOString(),
            decisionDate: null,
            rejectionReason: null,
            cancelledDate: null
        };

        leaveRequests.push(newRequest);

        localStorage.setItem(
            "leaveRequests",
            JSON.stringify(leaveRequests)
        );

        alert("Leave request submitted successfully.");

        window.location.href = "employee-dashboard.html";
    });

    cancelButton.addEventListener("click", function () {
        window.location.href = "employee-dashboard.html";
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

    return names[leaveType];
}

async function calculateWorkingDays(startDate, endDate) {

    const start = new Date(startDate);
    const end = new Date(endDate);

    const years = [];

    for (
        let year = start.getFullYear();
        year <= end.getFullYear();
        year++
    ) {
        years.push(year);
    }

    const holidays = [];

    for (const year of years) {

        const response = await fetch(
            `https://date.nager.at/api/v3/PublicHolidays/${year}/ZA`
        );

        if (!response.ok) {
            throw new Error("Holiday API failed");
        }

        const data = await response.json();

        data.forEach(function (holiday) {
            holidays.push(holiday.date);
        });
    }

    let workingDays = 0;

    const currentDate = new Date(start);

    while (currentDate <= end) {

        const day = currentDate.getDay();

        const dateString =
            currentDate.toISOString().split("T")[0];

        const isWeekend =
            day === 0 || day === 6;

        const isPublicHoliday =
            holidays.includes(dateString);

        if (!isWeekend && !isPublicHoliday) {
            workingDays++;
        }

        currentDate.setDate(currentDate.getDate() + 1);
    }

    return workingDays;
}

function getCompletedMonths(startDate) {
    const start = new Date(startDate);
    const today = new Date();

    let months =
        (today.getFullYear() - start.getFullYear()) * 12 +
        today.getMonth() - start.getMonth();

    if (today.getDate() < start.getDate()) {
        months--;
    }

    return months;
}


function validateLeaveEligibility(leaveType, employee) {
    const completedMonths =
        getCompletedMonths(employee.employmentStartDate);

    if (leaveType === "sick" && completedMonths < 3) {
        return "You must complete 3 months of employment to qualify for sick leave.";
    }

    if (leaveType === "maternity") {
        if (employee.gender !== "female") {
            return "Maternity leave is only available to female employees.";
        }

        if (completedMonths < 12) {
            return "You must complete 12 months of employment to qualify for paid maternity leave.";
        }
    }

    if (leaveType === "birthday") {
        const birthMonth =
            new Date(employee.dateOfBirth).getMonth();

        const startMonth =
            new Date(document.getElementById("startDate").value)
                .getMonth();

        const endMonth =
            new Date(document.getElementById("endDate").value)
                .getMonth();

        const startYear =
            new Date(document.getElementById("startDate").value)
                .getFullYear();

        const endYear =
            new Date(document.getElementById("endDate").value)
                .getFullYear();

        if (
            startMonth !== birthMonth ||
            endMonth !== birthMonth ||
            startYear !== endYear
        ) {
            return "Birthday leave must be taken within your birthday month.";
        }
    }

    return "";
}


function hasOverlappingLeave(
    employeeId,
    startDate,
    endDate,
    leaveRequests
) {
    return leaveRequests.some(function (request) {
        const isActiveRequest =
            request.status === "Pending" ||
            request.status === "Approved";

        const overlaps =
            startDate <= request.endDate &&
            endDate >= request.startDate;

        return request.employeeId === employeeId &&
            isActiveRequest &&
            overlaps;
    });
}