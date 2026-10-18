(function () {
    "use strict";

    const currentUser = getCurrentUser();

    if (!currentUser || currentUser.role !== "admin") {
        window.location.href = "index.html";
        return;
    }

    const requestList = document.getElementById("requestList");
    const requestDetails = document.getElementById("requestDetails");
    const statusFilter = document.getElementById("statusFilter");
    const adminMessage = document.getElementById("adminMessage");
    let selectedRequestId = null;

    document.getElementById("logoutButton").addEventListener("click", function () {
        localStorage.removeItem("currentUser");
        window.location.href = "index.html";
    });

    statusFilter.addEventListener("change", function () {
        renderRequestList();
    });

    renderDashboard();

    function renderDashboard() {
        const employees = getEmployees();
        // Keep yearly entitlements and accrued annual balances current when HR opens the dashboard.
        employees.forEach(function (employee) {
            syncEmployeeEntitlements(employee);
        });
        const requests = getLeaveRequests();

        document.getElementById("pendingCount").textContent = countStatus(requests, "Pending");
        document.getElementById("approvedCount").textContent = countStatus(requests, "Approved");
        document.getElementById("rejectedCount").textContent = countStatus(requests, "Rejected");
        document.getElementById("employeeCount").textContent = employees.length;

        renderRequestList();
        renderEmployeeOverview();

        if (selectedRequestId) {
            const selected = getLeaveRequests().find(function (request) {
                return request.requestId === selectedRequestId;
            });
            if (selected) renderRequestDetails(selected);
            else {
                selectedRequestId = null;
                requestDetails.innerHTML = '<p class="empty-state">Select a request to view its details.</p>';
            }
        }
    }

    function renderRequestList() {
        const requests = getLeaveRequests().slice().sort(function (a, b) {
            return new Date(b.submittedDate || 0) - new Date(a.submittedDate || 0);
        });
        const filter = statusFilter.value;
        const filtered = requests.filter(function (request) {
            return filter === "All" || request.status === filter;
        });

        if (filtered.length === 0) {
            requestList.innerHTML = '<div class="empty-state">No ' + escapeHtml(filter === "All" ? "leave requests" : filter.toLowerCase() + " requests") + ' found.</div>';
            return;
        }

        requestList.innerHTML = filtered.map(function (request) {
            const employee = findEmployee(request.employeeId);
            const name = employee ? employee.firstName + " " + employee.surname : "Unknown employee";
            const selectedClass = request.requestId === selectedRequestId ? " request-item-selected" : "";
            return '<button type="button" class="request-item' + selectedClass + '" data-request-id="' + escapeHtml(request.requestId) + '">' +
                '<span class="request-item-main">' +
                    '<span class="request-item-title">' + escapeHtml(name) + ' · ' + escapeHtml(getLeaveTypeName(request.leaveType)) + '</span>' +
                    '<span class="request-item-subtitle">' + escapeHtml(request.startDate) + ' to ' + escapeHtml(request.endDate) + ' · ' + escapeHtml(String(request.workingDays)) + ' working day(s)</span>' +
                '</span>' +
                '<span class="status-pill status-pill-' + escapeHtml(String(request.status || "pending").toLowerCase()) + '">' + escapeHtml(request.status || "Unknown") + '</span>' +
            '</button>';
        }).join("");

        requestList.querySelectorAll("[data-request-id]").forEach(function (button) {
            button.addEventListener("click", function () {
                selectedRequestId = button.dataset.requestId;
                clearMessage();
                renderRequestList();
                const request = getLeaveRequests().find(function (item) {
                    return item.requestId === selectedRequestId;
                });
                if (request) renderRequestDetails(request);
            });
        });
    }

    function renderRequestDetails(request) {
        const employee = findEmployee(request.employeeId);
        const balance = getEmployeeBalance(request.employeeId);
        const employeeName = employee ? employee.firstName + " " + employee.surname : "Unknown employee";
        const submitted = request.submittedDate ? new Date(request.submittedDate).toLocaleString() : "Not available";
        const decision = request.decisionDate ? new Date(request.decisionDate).toLocaleString() : "Not decided";
        const documentName = request.supportingDocument ? escapeHtml(request.supportingDocument) : "None provided";
        let payInformation = "";

        if (request.leaveType === "maternity") {
            const rate = Number(request.maternityPayRate ?? request.remunerationPercent ?? 0);
            payInformation = '<p><strong>Remuneration category:</strong> ' + (rate === 75 ? "75% remuneration" : "Unpaid (less than 12 months of service)") + '</p>';
        } else if (request.leaveType === "parental") {
            payInformation = '<p><strong>Remuneration:</strong> 75%</p>';
        }

        const actionControls = request.status === "Pending"
            ? '<div class="decision-actions">' +
                '<button type="button" id="approveRequestButton">Approve request</button>' +
                '<div class="reject-controls">' +
                    '<label for="rejectionReason">Reason for rejection</label>' +
                    '<textarea id="rejectionReason" rows="3" placeholder="Explain why this request is rejected"></textarea>' +
                    '<button type="button" id="rejectRequestButton" class="button-danger">Reject request</button>' +
                '</div>' +
              '</div>'
            : '<p class="decision-note">This request is <strong>' + escapeHtml(request.status) + '</strong>. No further decision can be made.</p>';

        requestDetails.innerHTML =
            '<div class="details-grid">' +
                detailBlock("Employee", employeeName) +
                detailBlock("Employee ID", request.employeeId) +
                detailBlock("Request ID", request.requestId) +
                detailBlock("Leave type", getLeaveTypeName(request.leaveType)) +
                detailBlock("Start date", request.startDate) +
                detailBlock("End date", request.endDate) +
                detailBlock("Working days", String(request.workingDays)) +
                detailBlock("Status", request.status) +
                detailBlock("Submitted", submitted) +
                detailBlock("Decision date", decision) +
            '</div>' +
            '<div class="detail-section"><h3>Reason provided</h3><p class="preserve-lines">' + escapeHtml(request.reason || "No reason provided") + '</p></div>' +
            '<div class="detail-section"><h3>Supporting document</h3><p>' + documentName + '</p><p class="muted small-note">Only the filename is stored in this browser. The uploaded file itself is not available here.</p></div>' +
            payInformation +
            (request.rejectionReason ? '<div class="detail-section rejection-note"><h3>Rejection reason</h3><p class="preserve-lines">' + escapeHtml(request.rejectionReason) + '</p></div>' : '') +
            (balance ? '<div class="detail-section"><h3>Current employee balance</h3><p>' + escapeHtml(formatDays(balance[request.leaveType] || 0)) + ' day(s) of ' + escapeHtml(getLeaveTypeName(request.leaveType).toLowerCase()) + '</p></div>' : '') +
            actionControls;

        const approveButton = document.getElementById("approveRequestButton");
        const rejectButton = document.getElementById("rejectRequestButton");
        if (approveButton) approveButton.addEventListener("click", function () { approveRequest(request.requestId); });
        if (rejectButton) rejectButton.addEventListener("click", function () {
            rejectRequest(request.requestId, document.getElementById("rejectionReason").value.trim());
        });
    }

    function approveRequest(requestId) {
        clearMessage();
        const requests = getLeaveRequests();
        const request = requests.find(function (item) { return item.requestId === requestId; });

        if (!request || request.status !== "Pending") {
            showMessage("This request is no longer pending. Refresh the list and try again.", "error");
            renderDashboard();
            return;
        }

        const employee = findEmployee(request.employeeId);
        if (!employee) {
            showMessage("The employee record could not be found. The request was not approved.", "error");
            return;
        }

        syncEmployeeEntitlements(employee);
        const balance = getEmployeeBalance(employee.employeeId);
        if (!balance) {
            showMessage("The employee's leave balance could not be found. The request was not approved.", "error");
            return;
        }

        // Exclude the current request while checking other requests, so it does not reserve its own days twice.
        const otherRequests = requests.filter(function (item) { return item.requestId !== request.requestId; });
        const eligibility = validateLeaveRequest(
            request.leaveType,
            employee,
            request.startDate,
            request.endDate,
            Number(request.workingDays),
            otherRequests
        );

        if (!eligibility.valid) {
            showMessage("Cannot approve this request: " + eligibility.message, "error");
            return;
        }

        if (request.leaveType !== "unpaid") {
            const availability = getLeaveAvailability(
                request.leaveType,
                employee,
                balance,
                otherRequests,
                request.startDate
            );
            if (Number(request.workingDays) > availability.available) {
                showMessage("Cannot approve this request because the employee's available balance has changed. Available: " + formatDays(availability.available) + " day(s).", "error");
                return;
            }
        }

        const confirmApproval = window.confirm(
            "Approve " + getLeaveTypeName(request.leaveType) + " for " + request.employeeId +
            " from " + request.startDate + " to " + request.endDate + "?"
        );
        if (!confirmApproval) return;

        if (request.leaveType !== "unpaid") {
            balance[request.leaveType] = roundDays(Number(balance[request.leaveType] || 0) - Number(request.workingDays));
            saveBalances(getLeaveBalances().map(function (item) {
                return item.employeeId === balance.employeeId ? balance : item;
            }));
        }

        request.status = "Approved";
        request.decisionDate = new Date().toISOString();
        request.rejectionReason = null;
        localStorage.setItem("leaveRequests", JSON.stringify(requests));

        showMessage("Request approved. The employee's balance has been updated.", "success");
        renderDashboard();
    }

    function rejectRequest(requestId, reason) {
        clearMessage();
        if (!reason) {
            showMessage("Enter a rejection reason before rejecting this request.", "error");
            document.getElementById("rejectionReason").focus();
            return;
        }

        const requests = getLeaveRequests();
        const request = requests.find(function (item) { return item.requestId === requestId; });
        if (!request || request.status !== "Pending") {
            showMessage("Only pending requests can be rejected.", "error");
            renderDashboard();
            return;
        }

        if (!window.confirm("Reject this leave request?")) return;

        request.status = "Rejected";
        request.decisionDate = new Date().toISOString();
        request.rejectionReason = reason;
        localStorage.setItem("leaveRequests", JSON.stringify(requests));

        showMessage("Request rejected. No leave balance was deducted.", "success");
        renderDashboard();
    }

    function renderEmployeeOverview() {
        const employees = getEmployees();
        const balances = getLeaveBalances();
        const requests = getLeaveRequests();
        const container = document.getElementById("employeeOverview");

        if (employees.length === 0) {
            container.innerHTML = '<p class="empty-state">No employees found.</p>';
            return;
        }

        const headers = ["Employee", "Employee ID", "Annual", "Sick", "Maternity", "Parental", "Family responsibility", "Study", "Birthday", "Unpaid", "Requests"];
        container.innerHTML = '<table class="admin-table"><thead><tr>' + headers.map(function (header) {
            return '<th scope="col">' + escapeHtml(header) + '</th>';
        }).join("") + '</tr></thead><tbody>' + employees.map(function (employee) {
            const balance = balances.find(function (item) { return item.employeeId === employee.employeeId; }) || {};
            const employeeRequests = requests.filter(function (request) { return request.employeeId === employee.employeeId; });
            return '<tr>' +
                '<td>' + escapeHtml(employee.firstName + " " + employee.surname) + '</td>' +
                '<td>' + escapeHtml(employee.employeeId) + '</td>' +
                '<td>' + escapeHtml(formatDays(balance.annual || 0)) + '</td>' +
                '<td>' + escapeHtml(formatDays(balance.sick || 0)) + '</td>' +
                '<td>' + escapeHtml(formatDays(balance.maternity || 0)) + '</td>' +
                '<td>' + escapeHtml(formatDays(balance.parental || 0)) + '</td>' +
                '<td>' + escapeHtml(formatDays(balance.familyResponsibility || 0)) + '</td>' +
                '<td>' + escapeHtml(formatDays(balance.study || 0)) + '</td>' +
                '<td>' + escapeHtml(formatDays(balance.birthday || 0)) + '</td>' +
                '<td>' + escapeHtml(formatDays(balance.unpaid || 0)) + '</td>' +
                '<td>' + employeeRequests.length + '</td>' +
            '</tr>';
        }).join("") + '</tbody></table>';
    }

    function saveBalances(balances) {
        localStorage.setItem("leaveBalances", JSON.stringify(balances));
    }

    function findEmployee(employeeId) {
        return getEmployees().find(function (employee) { return employee.employeeId === employeeId; });
    }

    function countStatus(requests, status) {
        return requests.filter(function (request) { return request.status === status; }).length;
    }

    function detailBlock(label, value) {
        return '<div class="detail-field"><span>' + escapeHtml(label) + '</span><strong>' + escapeHtml(value == null ? "—" : String(value)) + '</strong></div>';
    }

    function showMessage(message, type) {
        adminMessage.textContent = message;
        adminMessage.className = "notice notice-" + type;
    }

    function clearMessage() {
        adminMessage.textContent = "";
        adminMessage.className = "notice";
    }
})();
