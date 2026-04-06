import { _ as normalizeAccountId } from "./session-key-Do__tq1E.js";
import { r as normalizeStringEntries } from "./string-normalization-Ddc4JXRe.js";
import { i as resolveChannelEntryMatch, n as buildChannelKeyCandidates } from "./channel-config-D0eO5f5m.js";
import { i as resolveAllowlistMatchByCandidates } from "./allowlist-match-Dm6AqFEs.js";
import { l as getExecApprovalReplyMetadata } from "./exec-approval-reply-U2GCj4yL.js";
import "./routing-BVt9nMN-.js";
import { n as resolveApprovalRequestAccountId } from "./exec-approval-session-target-CBG7nt5k.js";
import { a as splitChannelApprovalCapability, c as createChannelExecApprovalProfile, d as createResolvedApproverActionAuthAdapter, i as createChannelApprovalCapability, o as createChannelApproverDmTargetResolver, r as createApproverRestrictedNativeApprovalCapability, s as createChannelNativeOriginTargetResolver, t as resolveApprovalApprovers, u as isChannelExecApprovalTargetRecipient } from "./approval-runtime-DY4QQiAW.js";
import "./matrix-runtime-heavy-GTvP284S.js";
import "./matrix-I7pvadwm.js";
import { i as resolveMatrixAccount, t as listMatrixAccountIds } from "./accounts-DS2fRXfi.js";
import { a as resolveMatrixTargetIdentity } from "./target-ids-DR8qn4Ki.js";
//#region extensions/matrix/src/matrix/monitor/allowlist.ts
function normalizeAllowList(list) {
	return normalizeStringEntries(list);
}
function normalizeMatrixUser(raw) {
	const value = (raw ?? "").trim();
	if (!value) return "";
	if (!value.startsWith("@") || !value.includes(":")) return value.toLowerCase();
	const withoutAt = value.slice(1);
	const splitIndex = withoutAt.indexOf(":");
	if (splitIndex === -1) return value.toLowerCase();
	const localpart = withoutAt.slice(0, splitIndex).toLowerCase();
	const server = withoutAt.slice(splitIndex + 1).toLowerCase();
	if (!server) return value.toLowerCase();
	return `@${localpart}:${server.toLowerCase()}`;
}
function normalizeMatrixUserId(raw) {
	const trimmed = (raw ?? "").trim();
	if (!trimmed) return "";
	const lowered = trimmed.toLowerCase();
	if (lowered.startsWith("matrix:")) return normalizeMatrixUser(trimmed.slice(7));
	if (lowered.startsWith("user:")) return normalizeMatrixUser(trimmed.slice(5));
	return normalizeMatrixUser(trimmed);
}
function normalizeMatrixAllowListEntry(raw) {
	const trimmed = raw.trim();
	if (!trimmed) return "";
	if (trimmed === "*") return trimmed;
	const lowered = trimmed.toLowerCase();
	if (lowered.startsWith("matrix:")) return `matrix:${normalizeMatrixUser(trimmed.slice(7))}`;
	if (lowered.startsWith("user:")) return `user:${normalizeMatrixUser(trimmed.slice(5))}`;
	return normalizeMatrixUser(trimmed);
}
function normalizeMatrixAllowList(list) {
	return normalizeAllowList(list).map((entry) => normalizeMatrixAllowListEntry(entry));
}
function resolveMatrixAllowListMatch(params) {
	const allowList = params.allowList;
	if (allowList.length === 0) return { allowed: false };
	if (allowList.includes("*")) return {
		allowed: true,
		matchKey: "*",
		matchSource: "wildcard"
	};
	const userId = normalizeMatrixUser(params.userId);
	return resolveAllowlistMatchByCandidates({
		allowList,
		candidates: [
			{
				value: userId,
				source: "id"
			},
			{
				value: userId ? `matrix:${userId}` : "",
				source: "prefixed-id"
			},
			{
				value: userId ? `user:${userId}` : "",
				source: "prefixed-user"
			}
		]
	});
}
//#endregion
//#region extensions/matrix/src/exec-approvals.ts
function normalizeMatrixApproverId(value) {
	return normalizeMatrixUserId(String(value)) || void 0;
}
function normalizeMatrixExecApproverId(value) {
	const normalized = normalizeMatrixApproverId(value);
	return normalized === "*" ? void 0 : normalized;
}
function resolveMatrixExecApprovalConfig(params) {
	const config = resolveMatrixAccount(params).config.execApprovals;
	if (!config) return { enabled: false };
	return {
		...config,
		enabled: config.enabled === true
	};
}
function getMatrixExecApprovalApprovers(params) {
	const account = resolveMatrixAccount(params).config;
	return resolveApprovalApprovers({
		explicit: account.execApprovals?.approvers,
		allowFrom: account.dm?.allowFrom,
		normalizeApprover: normalizeMatrixExecApproverId
	});
}
function isMatrixExecApprovalTargetRecipient(params) {
	return isChannelExecApprovalTargetRecipient({
		...params,
		channel: "matrix",
		normalizeSenderId: normalizeMatrixApproverId,
		matchTarget: ({ target, normalizedSenderId }) => normalizeMatrixApproverId(target.to) === normalizedSenderId
	});
}
const matrixExecApprovalProfile = createChannelExecApprovalProfile({
	resolveConfig: resolveMatrixExecApprovalConfig,
	resolveApprovers: getMatrixExecApprovalApprovers,
	normalizeSenderId: normalizeMatrixApproverId,
	isTargetRecipient: isMatrixExecApprovalTargetRecipient,
	matchesRequestAccount: (params) => {
		const turnSourceChannel = params.request.request.turnSourceChannel?.trim().toLowerCase() || "";
		const boundAccountId = resolveApprovalRequestAccountId({
			cfg: params.cfg,
			request: params.request,
			channel: turnSourceChannel === "matrix" ? null : "matrix"
		});
		return !boundAccountId || !params.accountId || normalizeAccountId(boundAccountId) === normalizeAccountId(params.accountId);
	}
});
const isMatrixExecApprovalClientEnabled = matrixExecApprovalProfile.isClientEnabled;
matrixExecApprovalProfile.isApprover;
const isMatrixExecApprovalAuthorizedSender = matrixExecApprovalProfile.isAuthorizedSender;
const resolveMatrixExecApprovalTarget = matrixExecApprovalProfile.resolveTarget;
const shouldHandleMatrixExecApprovalRequest = matrixExecApprovalProfile.shouldHandleRequest;
function buildFilterCheckRequest(params) {
	return {
		id: params.metadata.approvalId,
		request: {
			command: "",
			agentId: params.metadata.agentId ?? null,
			sessionKey: params.metadata.sessionKey ?? null
		},
		createdAtMs: 0,
		expiresAtMs: 0
	};
}
function shouldSuppressLocalMatrixExecApprovalPrompt(params) {
	if (!matrixExecApprovalProfile.shouldSuppressLocalPrompt(params)) return false;
	const metadata = getExecApprovalReplyMetadata(params.payload);
	if (!metadata) return false;
	if (metadata.approvalKind !== "exec") return false;
	const request = buildFilterCheckRequest({ metadata });
	return shouldHandleMatrixExecApprovalRequest({
		cfg: params.cfg,
		accountId: params.accountId,
		request
	});
}
//#endregion
//#region extensions/matrix/src/approval-auth.ts
function getMatrixApprovalAuthApprovers(params) {
	return resolveApprovalApprovers({
		allowFrom: resolveMatrixAccount(params).config.dm?.allowFrom,
		normalizeApprover: normalizeMatrixApproverId
	});
}
const matrixApprovalAuth = createResolvedApproverActionAuthAdapter({
	channelLabel: "Matrix",
	resolveApprovers: ({ cfg, accountId }) => getMatrixApprovalAuthApprovers({
		cfg,
		accountId
	}),
	normalizeSenderId: (value) => normalizeMatrixApproverId(value)
});
//#endregion
//#region extensions/matrix/src/approval-native.ts
const MATRIX_PLUGIN_NATIVE_DELIVERY_DISABLED = {
	enabled: false,
	preferredSurface: "approver-dm",
	supportsOriginSurface: false,
	supportsApproverDmSurface: false,
	notifyOriginWhenDmOnly: false
};
function normalizeComparableTarget(value) {
	const target = resolveMatrixTargetIdentity(value);
	if (!target) return value.trim().toLowerCase();
	if (target.kind === "user") return `user:${normalizeMatrixUserId(target.id)}`;
	return `${target.kind.toLowerCase()}:${target.id}`;
}
function resolveMatrixNativeTarget(raw) {
	const target = resolveMatrixTargetIdentity(raw);
	if (!target) return null;
	return target.kind === "user" ? `user:${target.id}` : `room:${target.id}`;
}
function normalizeThreadId(value) {
	return (value == null ? "" : String(value).trim()) || void 0;
}
function resolveTurnSourceMatrixOriginTarget(request) {
	const turnSourceChannel = request.request.turnSourceChannel?.trim().toLowerCase() || "";
	const target = resolveMatrixNativeTarget(request.request.turnSourceTo?.trim() || "");
	if (turnSourceChannel !== "matrix" || !target) return null;
	return {
		to: target,
		threadId: normalizeThreadId(request.request.turnSourceThreadId)
	};
}
function resolveSessionMatrixOriginTarget(sessionTarget) {
	const target = resolveMatrixNativeTarget(sessionTarget.to);
	if (!target) return null;
	return {
		to: target,
		threadId: normalizeThreadId(sessionTarget.threadId)
	};
}
function matrixTargetsMatch(a, b) {
	return normalizeComparableTarget(a.to) === normalizeComparableTarget(b.to) && (a.threadId ?? "") === (b.threadId ?? "");
}
function hasMatrixPluginApprovers(params) {
	return getMatrixApprovalAuthApprovers(params).length > 0;
}
const matrixNativeApprovalCapability = createApproverRestrictedNativeApprovalCapability({
	channel: "matrix",
	channelLabel: "Matrix",
	listAccountIds: listMatrixAccountIds,
	hasApprovers: ({ cfg, accountId }) => getMatrixExecApprovalApprovers({
		cfg,
		accountId
	}).length > 0,
	isExecAuthorizedSender: ({ cfg, accountId, senderId }) => isMatrixExecApprovalAuthorizedSender({
		cfg,
		accountId,
		senderId
	}),
	isNativeDeliveryEnabled: ({ cfg, accountId }) => isMatrixExecApprovalClientEnabled({
		cfg,
		accountId
	}),
	resolveNativeDeliveryMode: ({ cfg, accountId }) => resolveMatrixExecApprovalTarget({
		cfg,
		accountId
	}),
	requireMatchingTurnSourceChannel: true,
	resolveSuppressionAccountId: ({ target, request }) => target.accountId?.trim() || request.request.turnSourceAccountId?.trim() || void 0,
	resolveOriginTarget: createChannelNativeOriginTargetResolver({
		channel: "matrix",
		shouldHandleRequest: ({ cfg, accountId, request }) => shouldHandleMatrixExecApprovalRequest({
			cfg,
			accountId,
			request
		}),
		resolveTurnSourceTarget: resolveTurnSourceMatrixOriginTarget,
		resolveSessionTarget: resolveSessionMatrixOriginTarget,
		targetsMatch: matrixTargetsMatch
	}),
	resolveApproverDmTargets: createChannelApproverDmTargetResolver({
		shouldHandleRequest: ({ cfg, accountId, request }) => shouldHandleMatrixExecApprovalRequest({
			cfg,
			accountId,
			request
		}),
		resolveApprovers: getMatrixExecApprovalApprovers,
		mapApprover: (approver) => {
			const normalized = normalizeMatrixUserId(approver);
			return normalized ? { to: `user:${normalized}` } : null;
		}
	})
});
const splitMatrixApprovalCapability = splitChannelApprovalCapability(matrixNativeApprovalCapability);
const matrixBaseNativeApprovalAdapter = splitMatrixApprovalCapability.native;
const matrixBaseDeliveryAdapter = splitMatrixApprovalCapability.delivery;
const matrixDeliveryAdapter = matrixBaseDeliveryAdapter && {
	...matrixBaseDeliveryAdapter,
	shouldSuppressForwardingFallback: (params) => params.approvalKind === "plugin" ? false : matrixBaseDeliveryAdapter.shouldSuppressForwardingFallback?.(params) ?? false
};
const matrixExecOnlyNativeApprovalAdapter = matrixBaseNativeApprovalAdapter && {
	describeDeliveryCapabilities: (params) => params.approvalKind === "plugin" ? MATRIX_PLUGIN_NATIVE_DELIVERY_DISABLED : matrixBaseNativeApprovalAdapter.describeDeliveryCapabilities(params),
	resolveOriginTarget: async (params) => params.approvalKind === "plugin" ? null : await matrixBaseNativeApprovalAdapter.resolveOriginTarget?.(params) ?? null,
	resolveApproverDmTargets: async (params) => params.approvalKind === "plugin" ? [] : await matrixBaseNativeApprovalAdapter.resolveApproverDmTargets?.(params) ?? []
};
const matrixApprovalCapability = createChannelApprovalCapability({
	authorizeActorAction: (params) => {
		if (params.approvalKind !== "plugin") return matrixNativeApprovalCapability.authorizeActorAction?.(params) ?? { authorized: true };
		if (!hasMatrixPluginApprovers({
			cfg: params.cfg,
			accountId: params.accountId
		})) return {
			authorized: false,
			reason: "❌ Matrix plugin approvals are not enabled for this bot account."
		};
		return matrixApprovalAuth.authorizeActorAction(params);
	},
	getActionAvailabilityState: (params) => hasMatrixPluginApprovers({
		cfg: params.cfg,
		accountId: params.accountId
	}) ? { kind: "enabled" } : matrixNativeApprovalCapability.getActionAvailabilityState?.(params) ?? { kind: "disabled" },
	approvals: {
		delivery: matrixDeliveryAdapter,
		native: matrixExecOnlyNativeApprovalAdapter,
		render: matrixNativeApprovalCapability.render
	}
});
const matrixNativeApprovalAdapter = {
	auth: {
		authorizeActorAction: matrixApprovalCapability.authorizeActorAction,
		getActionAvailabilityState: matrixApprovalCapability.getActionAvailabilityState
	},
	delivery: matrixDeliveryAdapter,
	render: matrixApprovalCapability.render,
	native: matrixExecOnlyNativeApprovalAdapter
};
//#endregion
//#region extensions/matrix/src/matrix/monitor/rooms.ts
function resolveMatrixRoomConfig(params) {
	const rooms = params.rooms ?? {};
	const allowlistConfigured = Object.keys(rooms).length > 0;
	const { entry: matched, key: matchedKey, wildcardEntry, wildcardKey } = resolveChannelEntryMatch({
		entries: rooms,
		keys: buildChannelKeyCandidates(params.roomId, `room:${params.roomId}`, ...params.aliases),
		wildcardKey: "*"
	});
	const resolved = matched ?? wildcardEntry;
	return {
		allowed: resolved ? resolved.enabled !== false && resolved.allow !== false : false,
		allowlistConfigured,
		config: resolved,
		matchKey: matchedKey ?? wildcardKey,
		matchSource: matched ? "direct" : wildcardEntry ? "wildcard" : void 0
	};
}
//#endregion
export { shouldHandleMatrixExecApprovalRequest as a, normalizeMatrixUserId as c, isMatrixExecApprovalClientEnabled as i, resolveMatrixAllowListMatch as l, matrixApprovalCapability as n, shouldSuppressLocalMatrixExecApprovalPrompt as o, matrixNativeApprovalAdapter as r, normalizeMatrixAllowList as s, resolveMatrixRoomConfig as t };
