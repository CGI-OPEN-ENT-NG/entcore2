import http from 'axios';
import { Context } from '../mappings/context';
import { Session } from '../mappings/session';

export class SessionModel {

    private static session: Session;
    private static context: Context;

    public static getSession(): Promise<Session> {
        if (!SessionModel.session) {

            return new Promise((resolve, reject) => {
                http.get('/auth/oauth2/userinfo')
                .then(result => {
                    SessionModel.session = result.data as Session;
                    Object.setPrototypeOf(SessionModel.session, new Session());
                    resolve(SessionModel.session);
                }, e => {
                    console.error(e);
                    resolve(new Session());
                });
            });
        } else {
            return new Promise(res => res(SessionModel.session));
        }
    }

    public static getContext(): Promise<Context> {
        if (!SessionModel.context) {
            return new Promise((resolve, reject) => {
                http.get('/auth/context')
                .then(result => {
                    SessionModel.context = result.data as Context;
                    Object.setPrototypeOf(SessionModel.context, new Context());
                    resolve(SessionModel.context);
                }, e => {
                    console.error(e);
                    resolve(new Context());
                });
            });
        } else {
            return Promise.resolve( SessionModel.context );
        }
    }
}
