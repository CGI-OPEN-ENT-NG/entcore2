import { Component, Injector, Input, OnDestroy, OnInit, Output, EventEmitter, OnChanges, SimpleChanges, ElementRef, ViewChild } from '@angular/core';
import { OdeComponent } from 'ngx-ode-core';
import { OrderPipe, SelectOption, SpinnerService } from 'ngx-ode-ui';
import { NotifyService } from 'src/app/core/services/notify.service';
import { UserListService } from 'src/app/core/services/userlist.service';
import { globalStore } from 'src/app/core/store/global.store';
import { StructureModel } from 'src/app/core/store/models/structure.model';
import { UserModel } from 'src/app/core/store/models/user.model';
import { DeleteFilter, UserlistFiltersService } from '../../../../../core/services/userlist.filters.service';
import { GroupsStore } from '../../../../groups.store';

@Component({
    selector: 'ode-group-input-users',
    templateUrl: './group-input-users.component.html',
    styleUrls: ['./group-input-users.component.scss'],
    providers: [UserListService]
})
export class GroupInputUsersComponent extends OdeComponent implements OnInit, OnDestroy, OnChanges {

    @Input() model: UserModel[] = [];
    @Output() selectUsers: EventEmitter<UserModel[]> = new EventEmitter();

    public excludeDeletedUsers: DeleteFilter;

    // list elements stored by store pipe in list component
    // (takes filters in consideration)
    storedElements: UserModel[] = [];

    // Users selected by enduser
    selectedUsers: UserModel[] = [];

    structure: StructureModel;
    structures: StructureModel[] = [];

    structureOptions: SelectOption<StructureModel>[] = [];
    structureFilter: string = '';
    isDropdownOpened: boolean = false;
    show: boolean = false;

    constructor(private groupsStore: GroupsStore,
                public userLS: UserListService,
                private spinner: SpinnerService,
                private ns: NotifyService,
                injector: Injector,
                private orderPipe: OrderPipe,
                public listFilters: UserlistFiltersService) {
        super(injector);
        this.excludeDeletedUsers = new DeleteFilter(listFilters.$updateSubject);
        this.excludeDeletedUsers.outputModel = ['users.not.deleted'];
    }

    ngOnInit(): void {
        super.ngOnInit();
        this.structure = this.groupsStore.structure;
        this.structures = globalStore.structures.data;
        this.structureOptions = this.orderPipe.transform(this.structures, '+name')
            .map(structure => ({value: structure, label: structure.name}));

            console.log(this.structureOptions);
            
        this.subscriptions.add(this.listFilters.$updateSubject.subscribe(() => {
            this.changeDetector.markForCheck();
        }));
    }

    ngOnChanges(changes:SimpleChanges){
        super.ngOnChanges(changes);
        if(changes['model']){
            if(this.structure){
                this.structureChange(this.structure);
            }
        }
    }

    selectUser(u: UserModel): void {
        if (this.selectedUsers.indexOf(u) === -1) {
            this.selectedUsers.push(u);
        } else {
            this.selectedUsers = this.selectedUsers.filter(su => su.id !== u.id);
        }
        this.selectUsers.emit(this.selectedUsers);
    }

    isSelected = (user: UserModel) => {
        return this.selectedUsers.indexOf(user) > -1;
    }

    selectAll(): void {
        this.selectedUsers = this.storedElements;
        this.selectUsers.emit(this.selectedUsers);
    }

    deselectAll(): void {
        this.selectedUsers = [];
        this.selectUsers.emit(this.selectedUsers);
    }

    structureChange(s: StructureModel): void {
        const selectedStructure: StructureModel = globalStore.structures.data.find(
            globalS => globalS.id === s.id);
        this.structure = selectedStructure;

        if (selectedStructure.users && selectedStructure.users.data
            && selectedStructure.users.data.length < 1) {
            this.spinner.perform('group-manage-users',
                selectedStructure.users.sync()
                    .then(() => {
                        this.model = selectedStructure.users.data
                            .filter(u =>
                                this.groupsStore.group.users.map(x => x.id).indexOf(u.id) === -1);
                        this.isDropdownOpened = false;
                        this.changeDetector.markForCheck();
                    })
                    .catch((err) => {
                        this.ns.error(
                            {
                                key: 'notify.structure.syncusers.error.content'
                                , parameters: {structure: s.name}
                            }
                            , 'notify.structure.syncusers.error.title'
                            , err);
                    })
            );
        } else {
            this.model = selectedStructure.users.data
                .filter(u => this.groupsStore.group.users.map(x => x.id).indexOf(u.id) === -1);
            this.changeDetector.markForCheck();
        }
    }

    filterByInput = (structure: StructureModel): boolean => {
        return !!this.structureFilter 
            ? structure.name.toLowerCase().indexOf(this.structureFilter.toLowerCase()) >= 0 
            : true;
    }

    onDropdown():void {
        this.isDropdownOpened = !this.isDropdownOpened;
        if (this.isDropdownOpened) this.structureFilter = '';
        this.changeDetector.markForCheck();
    }
}

