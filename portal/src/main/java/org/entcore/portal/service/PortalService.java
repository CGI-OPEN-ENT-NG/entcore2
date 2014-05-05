/*
 * Copyright. Tous droits réservés. WebServices pour l’Education.
 */

package org.entcore.portal.service;

import com.samskivert.mustache.Mustache;
import com.samskivert.mustache.Template;
import org.entcore.common.neo4j.Neo;
import fr.wseduc.webutils.Controller;
import fr.wseduc.webutils.I18n;
import fr.wseduc.webutils.http.StaticResource;
import org.entcore.common.user.UserUtils;
import org.entcore.common.user.UserInfos;
import org.entcore.portal.utils.ThemeUtils;
import fr.wseduc.security.ActionType;
import fr.wseduc.security.SecuredAction;

import java.io.IOException;
import java.io.Writer;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentMap;

import org.vertx.java.core.AsyncResult;
import org.vertx.java.core.Handler;
import org.vertx.java.core.Vertx;
import org.vertx.java.core.eventbus.Message;
import org.vertx.java.core.file.FileProps;
import org.vertx.java.core.http.HttpServerRequest;
import org.vertx.java.core.http.RouteMatcher;
import org.vertx.java.core.json.JsonArray;
import org.vertx.java.core.json.JsonObject;
import org.vertx.java.platform.Container;

import static org.entcore.common.user.SessionAttributes.*;

public class PortalService extends Controller {

	private final ConcurrentMap<String, String> staticRessources;
	private final boolean dev;
	private final Neo neo;
	private List<String> themes;
	private final String themesPrefix;
	private final Container container;
	private final String assetsPath;

	public PortalService(Vertx vertx, Container container, RouteMatcher rm,
			Map<String, fr.wseduc.webutils.security.SecuredAction> securedActions) {
		super(vertx, container, rm, securedActions);
		this.container = container;
		this.staticRessources = vertx.sharedData().getMap("staticRessources");
		dev = "dev".equals(container.config().getString("mode"));
		this.neo = new Neo(eb, log);
		assetsPath = container.config().getString("assets-path", ".");
		themesPrefix = "/assets/themes/" + container.config().getString("skin");
		ThemeUtils.availableThemes(vertx, assetsPath + themesPrefix, false, new Handler<List<String>>() {
			@Override
			public void handle(List<String> event) {
				themes = event;
			}
		});
	}

	private void assetTemplateLambda(final HttpServerRequest request, JsonObject params) {
		params.putValue("asset", new Mustache.Lambda() {

			@Override
			public void execute(Template.Fragment frag, Writer out) throws IOException {
				String path = frag.execute();
				String r = container.config().getBoolean("ssl", false) ? "https://" : "http://"
						+ request.headers().get("Host")
						+ "/assets/themes"
						+ "/" + container.config().getString("skin")
						+ "/" + path;
				out.write(r);
			}
		});
	}

	@SecuredAction(value = "portal.auth",type = ActionType.AUTHENTICATED)
	public void welcome(HttpServerRequest request) {
		renderView(request);
	}

	@SecuredAction(value = "portal.auth",type = ActionType.AUTHENTICATED)
	public void portal(final HttpServerRequest request) {
		UserUtils.getUserInfos(eb, request, new Handler<UserInfos>() {

			@Override
			public void handle(UserInfos user) {
				if (user != null) {
					redirectPermanent(request, container.config().getString("root-page", "/welcome"));
				} else {
					unauthorized(request);
				}
			}
		});
	}

	public void themeDocumentation(HttpServerRequest request) {
		renderView(request);
	}

	public void directivesDocumentation(HttpServerRequest request) {
		renderView(request);
	}

	@SecuredAction(value = "portal.auth",type = ActionType.AUTHENTICATED)
	public void apps(final HttpServerRequest request) {
		UserUtils.getSession(eb, request, new Handler<JsonObject>() {

			@Override
			public void handle(JsonObject session) {
				JsonArray apps = session.getArray("apps", new JsonArray());
				I18n i18n = I18n.getInstance();
				for (Object o : apps) {
					if (!(o instanceof JsonObject)) continue;
					JsonObject j = (JsonObject) o;
					String d = j.getString("displayName");
					if (d == null || d.trim().isEmpty()) {
						d = j.getString("name");
					}
					if (d != null) {
						j.putString("displayName",
								i18n.translate(d, request.headers().get("Accept-Language")));
					}
				}
				JsonObject json = new JsonObject()
						.putArray("apps", apps);
				assetTemplateLambda(request, json);
				renderView(request, json);
			}
		});

	}

	@SecuredAction(value = "portal.auth",type = ActionType.AUTHENTICATED)
	public void applicationsList(final HttpServerRequest request) {
		UserUtils.getSession(eb, request, new Handler<JsonObject>() {

			@Override
			public void handle(JsonObject session) {
				JsonArray apps = session.getArray("apps", new JsonArray());
				for (Object o : apps) {
					if (!(o instanceof JsonObject)) continue;
					JsonObject j = (JsonObject) o;
					String d = j.getString("displayName");
					if (d == null || d.trim().isEmpty()) {
						d = j.getString("name");
					}
					if (d != null) {
						j.putString("displayName", d);
					}
				}
				JsonObject json = new JsonObject()
						.putArray("apps", apps);
				renderJson(request, json);
			}
		});
	}
	
	@SecuredAction(value = "portal.auth",type = ActionType.AUTHENTICATED)
	public void adapter(final HttpServerRequest request) {
		UserUtils.getSession(eb, request, new Handler<JsonObject>() {

			@Override
			public void handle(JsonObject session) {
				JsonObject params = new JsonObject();
				assetTemplateLambda(request, params);
				renderView(request, params);
			}
		});

	}

	public void assets(final HttpServerRequest request) {
		if (dev) {
			request.response().sendFile(assetsPath + request.path());
		} else {
			if (staticRessources.containsKey(request.uri())) {
				StaticResource.serveRessource(request,
						assetsPath + request.path(),
						staticRessources.get(request.uri()));
			} else {
				vertx.fileSystem().props(assetsPath + request.path(),
						new Handler<AsyncResult<FileProps>>(){
					@Override
					public void handle(AsyncResult<FileProps> af) {
						if (af.succeeded()) {
							String lastModified = StaticResource.formatDate(af.result().lastModifiedTime());
							staticRessources.put(request.uri(), lastModified);
							StaticResource.serveRessource(request,
									assetsPath + request.path(),
									lastModified);
						} else {
							request.response().sendFile(assetsPath + request.path());
						}
					}
				});
			}
		}
	}

	@SecuredAction(value = "portal", type = ActionType.AUTHENTICATED)
	public void getTheme(final HttpServerRequest request) {
		UserUtils.getUserInfos(eb, request, new Handler<UserInfos>() {
			@Override
			public void handle(final UserInfos user) {
				if (user != null) {
					Object t = user.getAttribute(THEME_ATTRIBUTE);
					if (t != null) {
						renderJson(request, new JsonObject(t.toString()));
						return;
					}
					JsonObject urls = container.config().getObject("urls", new JsonObject());
					final JsonObject theme = new JsonObject()
							.putString("template", "/public/template/portal.html")
							.putString("logoutCallback", urls.getString("logoutCallback", ""));
					String query =
							"MATCH (n:User)-[:USERBOOK]->u " +
							"WHERE n.id = {id} " +
							"RETURN u.theme as theme";
					Map<String, Object> params = new HashMap<>();
					params.put("id", user.getUserId());
					neo.send(query, params, new Handler<Message<JsonObject>>() {
						@Override
						public void handle(Message<JsonObject> event) {
							if ("ok".equals(event.body().getString("status"))) {
								String userTheme = event.body().getObject("result", new JsonObject())
										.getObject("0", new JsonObject()).getString("theme");
								if (userTheme != null && themes.contains(userTheme)) {
									theme.putString("skin", themesPrefix + "/" + userTheme + "/");
								} else {
									theme.putString("skin", themesPrefix + "/default/");
								}
							} else {
								theme.putString("skin", themesPrefix + "/default/");
							}
							renderJson(request, theme);
							UserUtils.addSessionAttribute(eb, user.getUserId(), THEME_ATTRIBUTE, theme.encode(), null);
						}
					});
				} else {
					unauthorized(request);
				}
			}
		});
	}

	public void getSkin(final HttpServerRequest request) {
		renderJson(request, new JsonObject().putString("skin", container.config().getString("skin")));
	}

	public void locale(HttpServerRequest request) {
		String[] langs = request.headers().get("Accept-Language").split(",");
		renderJson(request, new JsonObject().putString("locale",
				Locale.forLanguageTag(langs[0].split("-")[0]).toString()));
	}

	@SecuredAction(value = "config", type = ActionType.AUTHENTICATED)
	public void adminURLS(HttpServerRequest request){
		renderJson(request, container.config().getArray("admin-urls", new JsonArray()));
	}

	@SecuredAction(value = "config", type = ActionType.AUTHENTICATED)
	public void widgets(HttpServerRequest request){
		renderJson(request, container.config().getArray("widgets", new JsonArray()));
	}
	
	@SecuredAction("admin.view")
	public void admin(HttpServerRequest request) {
		redirectPermanent(request, "/directory/admin");
	}

}
