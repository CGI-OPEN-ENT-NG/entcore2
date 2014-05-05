/*
 * Copyright. Tous droits réservés. WebServices pour l’Education.
 */

package org.entcore.auth.oauth;

import org.vertx.java.core.http.HttpServerRequest;

public class OAuthAuthorizationResponse {

	public static void code(HttpServerRequest request,
			String redirectUri, String code, String state) {
		String params = "code=" + code;
		if (state != null && !state.trim().isEmpty()) {
			params += "&state=" + state;
		}
		redirect(request, redirectUri, params);
	}

	public static void invalidRequest(HttpServerRequest request, String redirectUri, String state) {
		error(request, redirectUri, "invalid_request", state);
	}

	public static void unauthorizedClient(HttpServerRequest request, String redirectUri, String state) {
		error(request, redirectUri, "unauthorized_client", state);
	}

	public static void accessDenied(HttpServerRequest request, String redirectUri, String state) {
		error(request, redirectUri, "access_denied", state);
	}

	public static void unsupportedResponseType(HttpServerRequest request, String redirectUri, String state) {
		error(request, redirectUri, "unsupported_response_type", state);
	}

	public static void invalidScope(HttpServerRequest request, String redirectUri, String state) {
		error(request, redirectUri, "invalid_scope", state);
	}

	public static void serverError(HttpServerRequest request, String redirectUri, String state) {
		error(request, redirectUri, "server_error", state);
	}

	public static void temporarilyUnavailable(HttpServerRequest request, String redirectUri, String state) {
		error(request, redirectUri, "temporarily_unavailable", state);
	}

	private static void error(HttpServerRequest request, String redirectUri, String error, String state) {
		String params = "error=" + error;
		if (state != null && !state.trim().isEmpty()) {
			params += "&state=" + state;
		}
		redirect(request, redirectUri, params);
	}

	private static void redirect(HttpServerRequest request, String redirectUri, String params) {
//		String p;
//		try {
//			p = URLEncoder.encode(params, "UTF-8");
//		} catch (UnsupportedEncodingException e) {
//			p = params;
//		}
		request.response().setStatusCode(302);
		request.response().putHeader("Location", redirectUri + "?" + params);
		request.response().end();
	}

}
