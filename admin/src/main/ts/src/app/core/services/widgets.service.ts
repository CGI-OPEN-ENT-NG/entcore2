import {Injectable} from '@angular/core';
import { Profile, Structure } from 'src/app/services/_shared/services-types';
import { WidgetModel } from '../store/models/widget.model';
import { NotifyService } from './notify.service';
import http from 'axios';

type DefaultBookmarks = {
    defaultBookmarks:[]
};

@Injectable()
export class WidgetService {
    constructor( private notify:NotifyService ) {
    }

    public massLink(widget:WidgetModel, structure:Structure, profiles:Array<Profile>) {
        const url = `/appregistry/widget/${widget.id}/authorize/${structure.id}`;
        return http.put(url + (profiles.length>0 ? "?profile="+profiles.join("&profile=") : ""))
            .then( () => this.notify.info('widget.mass.link.notify.ok') )
            .catch( () => this.notify.error('widget.mass.link.notify.ko') );
    }

    public massUnlink(widget:WidgetModel, structure:Structure, profiles:Array<Profile>){
        const url = `/appregistry/widget/${widget.id}/authorize/${structure.id}`;
        return http.delete(url + (profiles.length>0 ? "?profile="+profiles.join("&profile=") : ""))
            .then( () => this.notify.info('widget.mass.unlink.notify.ok') )
            .catch( () => this.notify.error('widget.mass.unlink.notify.ko') );
    }

    public massSetMandatory(widget:WidgetModel, structure:Structure, profiles:Array<Profile>){
        const url = `/appregistry/widget/${widget.id}/mandatory/${structure.id}/mass`;
        return http.put(url + (profiles.length>0 ? "?profile="+profiles.join("&profile=") : ""))
            .then( () => this.notify.info('widget.notify.ok') )
            .catch( () => this.notify.error('widget.notify.ko') );
    }
    
    public massUnsetMandatory(widget:WidgetModel, structure:Structure, profiles:Array<Profile>){
        const url = `/appregistry/widget/${widget.id}/mandatory/${structure.id}/mass`;
        return http.delete(url + (profiles.length>0 ? "?profile="+profiles.join("&profile=") : ""))
            .then( () => this.notify.info('widget.notify.ok') )
            .catch( () => this.notify.error('widget.notify.ko') );
    }

    public getMyAppsParameters(structure:Structure):Promise<[]> {
        const url = `/appregistry/applications/${structure.id}/default-bookmarks`;
        return http.get<DefaultBookmarks>(url)
            .then( b => {
                if(b.status===200) return b.data.defaultBookmarks;
                throw 'unexpected error';
            })
            .catch( () => {
                this.notify.error('services.widget.myapps.prefs.load.error');
                return [];
            } );
    }

    public setMyAppsParameters(structure:Structure, bookmarks:[]) {
        const url = `/appregistry/applications/${structure.id}/default-bookmarks`;
        return http.put(url, {apps: bookmarks})
            .then( () => this.notify.info('widget.notify.ok') )
            .catch( () => this.notify.error('widget.notify.ko') );
    }
}