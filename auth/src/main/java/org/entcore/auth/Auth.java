/* Copyright © WebServices pour l'Éducation, 2014
 *
 * This file is part of ENT Core. ENT Core is a versatile ENT engine based on the JVM.
 *
 * This program is free software; you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation (version 3 of the License).
 *
 * For the sake of explanation, any module that communicate over native
 * Web protocols, such as HTTP, with ENT Core is outside the scope of this
 * license and could be license under its own terms. This is merely considered
 * normal use of ENT Core, and does not fall under the heading of "covered work".
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 *
 */

package org.entcore.auth;

import org.entcore.auth.security.AuthResourcesProvider;
import org.entcore.common.http.BaseServer;
import fr.wseduc.webutils.request.filter.SecurityHandler;
import fr.wseduc.webutils.request.filter.UserAuthFilter;
import fr.wseduc.webutils.security.oauth.DefaultOAuthResourceProvider;
import org.entcore.common.neo4j.Neo;
import org.vertx.java.core.eventbus.EventBus;

public class Auth extends BaseServer {

	@Override
	public void start() {
		final EventBus eb = getEventBus(vertx);
		SecurityHandler.clearFilters();
		SecurityHandler.addFilter(new UserAuthFilter(new DefaultOAuthResourceProvider(eb)));
		setResourceProvider( new AuthResourcesProvider(new Neo(eb, container.logger())));
		super.start();
		addController(new AuthController());
	}

}
