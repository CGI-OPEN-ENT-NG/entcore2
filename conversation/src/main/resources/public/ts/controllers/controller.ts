import { ng, notify, idiom as lang, template, skin, moment, Document, $, _, ui } from 'entcore';
import { Mail, User, UserFolder, quota, Conversation, Trash, SystemFolder, Attachment } from '../model';

export let conversationController = ng.controller('ConversationController', [
    '$scope', '$timeout', '$compile', '$sanitize', 'model', 'route', 'VideoEventTracker', function ($scope, $timeout, $compile, $sanitize, model, route, videoEventTracker) {
        $scope.state = {
            selectAll: false,
            filterUnread: false,
            searching: false,
            current: undefined,
            newItem: undefined,
            draftError: false,
            dragFolder: undefined,
            emptyMessage: lang.translate('folder.empty'),
            searchFailed: false,
            draftSaveDate: null,
            mailLimit: 5000,
            recipientLimit: ui.breakpoints.checkMaxWidth("fatMobile") ? 5 : 10
        };
        $scope.defaultAvatar = "img/illustrations/unknown-avatar.svg?thumbnail=100x100";
        $scope.conversation = Conversation.instance;
        $scope.ccCciShow = false;
        $scope.showWarnAboutCommunicationRules = false;

        route({
            readMail: async function (params) {
                Conversation.instance.folders.openFolder('inbox');
                template.open('page', 'folders');
                $scope.readMail(new Mail(params.mailId));
                await Conversation.instance.sync();
                await Conversation.instance.folders.draft.countTotal();
                $scope.constructNewItem();
                $scope.$apply();
            },
            writeMail: async function (params) {
                Conversation.instance.folders.openFolder('inbox');
                await Conversation.instance.sync();
                template.open('page', 'folders');
                template.open('main', 'mail-actions/write-mail');
                $scope.constructNewItem();

                if (_.isString(params.id)) {
                    if (!params.type || params.type === 'User') {
                        let user = new User(params.id);
                        await user.findData();
                        $scope.addUser(user);
                    }
                    else if (params.type === 'Group') {
                        let group = new User(params.id);
                        await group.findGroupData();
                        $scope.addUser(group);
                    }
                    else if (params.type === 'Favorite') {
                        await $scope.state.newItem.addFavorite(params.id);
                    }
                } else if (params.id !== undefined) {
                    for (let i = 0; i < params.id.length; i++) {
                        let user = new User(params.id[i]);
                        await user.findData();
                        $scope.addUser(user);
                    }
                }
                $scope.$apply();
            },
            inbox: async () => {
                template.open('page', 'folders');
                await Conversation.instance.folders.openFolder('inbox');
                await Conversation.instance.sync();
                await Conversation.instance.folders.draft.countTotal();
                $scope.constructNewItem()
                $scope.$apply();
            }
        });

        $scope.lang = lang;
        $scope.notify = notify;
        $scope.folders = Conversation.instance.folders;
        $scope.userFolders = Conversation.instance.userFolders;
        $scope.users = { list: Conversation.instance.users, search: '', found: [], foundCC: [] };
        template.open('main', 'folders-templates/inbox');
        template.open('toaster', 'folders-templates/toaster');
        $scope.formatFileType = Document.role;
        $scope.sending = false;
        /**
         * WORKSPACE
         */

        $scope.copyProps = {
            i18: {
                title: "conversation.copy.title",
                actionTitle: "conversation.copy.action",
                actionProcessing: "conversation.copy.processing",
                actionFinished: "conversation.copy.finished",
                info: "conversation.copy.info"
            },
            sources: [],
            onCancel() {
                $scope.copyLightbox.show = false;
            },
            onSubmitSuccess(dest, count: number) {
                if (count > 1) {
                    notify.info('conversation.notify.copyToWorkspace.plural');
                } else {
                    notify.info('conversation.notify.copyToWorkspace');
                }
                $scope.copyLightbox.show = false;
            }
        }
        $scope.copyToWorkspace = async function (attachment: Attachment | Attachment[]) {
            let attachments: Attachment[];
            if (attachment instanceof Array) {
                attachments = attachment;
            } else {
                attachments = [attachment];
            }
            const sources = await (($scope.mail as Mail) || ($scope.state.newItem as Mail)).toFolderPickerSources(attachments);
            $scope.copyLightbox.show = true;
            $scope.copyProps.sources = sources;
            $scope.$apply();
        }
        //
        $scope.increaseMailLimit = () => {
            $scope.state.mailLimit += 5000;
        }

        $scope.resetMailLimit = () => {
            $scope.state.mailLimit = 5000;
        }

        $scope.addUser = (user) => {
            if (!$scope.state.newItem.to) {
                $scope.state.newItem.to = [];
            }

            $scope.state.newItem.to.push(user);
        };

        $scope.resetScope = function () {
            $scope.openInbox();
        };

        $scope.resetState = function () {
            $scope.state.selectAll = false;
            $scope.state.filterUnread = false;
            $scope.state.searching = false;
            $scope.state.draftError = false;
            $scope.state.emptyMessage = lang.translate('folder.empty');
            $scope.state.searchFailed = false;
            $scope.state.draftSaveDate = null;

        };

        $scope.constructNewItem = function () {
            $scope.state.newItem = new Mail();
            $scope.state.newItem.setMailFirstSpace();
            $scope.state.newItem.setMailSignature($scope.getSignature());
        }

        $scope.getSignature = () => {
            if (Conversation.instance.preference.useSignature)
                return Conversation.instance.preference.signature.replace(new RegExp('\n', 'g'), '<br>');
            return '';
        }


        $scope.openFolder = async folderName => {
            $scope.mail = undefined;
            $scope.ccCciShow = false;
            if (!folderName) {
                if (Conversation.instance.currentFolder instanceof UserFolder) {
                    $scope.openUserFolder(Conversation.instance.currentFolder, {});
                    return;
                }
                folderName = (Conversation.instance.currentFolder as SystemFolder).folderName;
            }
            $scope.state.newItem = new Mail();
            $scope.state.newItem.setMailSignature($scope.getSignature());
            template.open('main', 'folders-templates/' + folderName);
            $scope.resetState();
            await Conversation.instance.folders.openFolder(folderName);
            await Conversation.instance.currentFolder.countUnread();
            $scope.$apply();
            $scope.updateWherami();
        };

        $scope.openUserFolderOnDragover = async (folder: UserFolder, obj) => {
            if ((Conversation.instance.currentFolder as UserFolder).id != folder.id)
                await $scope.openUserFolder(folder, obj);
        }

        $scope.openUserFolder = async (folder: UserFolder, obj) => {
            $scope.mail = undefined;
            $scope.state.newItem = new Mail();
            $scope.state.newItem.setMailSignature($scope.getSignature());
            obj.template = 'folder-content';
            template.open('main', 'folders-templates/user-folder');
            $scope.resetState();
            await folder.open(()=>{
                $scope.safeApply();
            });
            $scope.$apply();
            $scope.updateWherami();
        };

        $scope.isParentOf = function (folder, targetFolder) {
            if (!targetFolder || !targetFolder.parentFolder)
                return false

            var ancestor = targetFolder.parentFolder
            while (ancestor) {
                if (folder.id === ancestor.id)
                    return true
                ancestor = ancestor.parentFolder
            }
            return false
        }

        $scope.variableMailAction = function (mail) {
            var systemFolder = mail.getSystemFolder();
            if (systemFolder === "DRAFT")
                return $scope.viewMail(mail);
            else if (systemFolder === "OUTBOX")
                return $scope.viewMail(mail);
            else
                return $scope.readMail(mail);
        }

        $scope.removeFromUserFolder = async (event, mail) => {
            if (Conversation.instance.currentFolder instanceof UserFolder) {
                await Conversation.instance.currentFolder.removeMailsFromFolder();
                await Conversation.instance.folders.inbox.countUnread();
                await Conversation.instance.folders.draft.countTotal();
                $scope.state.selectAll = false;
                $scope.$apply();
            }
        };

        $scope.nextPage = async () => {
            if (template.containers.main.indexOf('mail-actions') < 0) {
                await Conversation.instance.currentFolder.nextPage($scope.state.selectAll);
                $scope.$apply();
            }
        };

        $scope.switchSelectAll = function () {
            if ($scope.state.selectAll) {
                Conversation.instance.currentFolder.selectAll();
            }
            else {
                Conversation.instance.currentFolder.deselectAll();
            }
        };

        $scope.refreshSelectionState = function (mail) {
            if (!mail.selected)
                $scope.state.selectAll = false
        };

        function setCurrentMail(mail: Mail, doNotSelect?: boolean) {
            $scope.state.current = mail;
            Conversation.instance.currentFolder.deselectAll();
            if (!doNotSelect)
                $scope.state.current.selected = true;
            $scope.mail = mail;
            $scope.isSlided = false;
            $scope.messageHistory = lang.translate('message.history.show');
        }

        $scope.viewMail = async function (mail) {
            $scope.resetMailLimit();
            template.open('main', 'mail-actions/view-mail');
            window.scrollTo(0, 0);
            setCurrentMail(mail);
            try {
                await mail.open();
                $scope.$root.$emit('refreshMails');
                $timeout(function () {
                    const mailReader = document.querySelector('.lct-mail-reader');
                    if (mailReader && mailReader.textContent.length < 2000) {
                        $scope.state.mailLimit = mail.bodyShown.length;
                    }
                }, 0);
            } 
            catch (e) {
                template.open('page', 'errors/e404');
            }
        };

        $scope.refresh = async function () {
            notify.info('updating');
            await Conversation.instance.currentFolder.mails.refresh();
            await Conversation.instance.folders.inbox.countUnread();
            $scope.$apply();
        };

        $scope.readMail = async (mail: Mail) => {
            $scope.resetMailLimit();
            template.open('main', 'mail-actions/read-mail');
            window.scrollTo(0, 0);
            setCurrentMail(mail, true);
            try {
                await mail.open();
                $scope.$root.$emit('refreshMails');
                $timeout(function () {
                    const mailReader = document.querySelector('.lct-mail-reader');
                    if (mailReader && mailReader.textContent.length < 2000) {
                        $scope.state.mailLimit = mail.bodyShown.length;
                    }
                }, 0);

								// Wait a tick for video component to be displayed
                setTimeout( ()=>{videoEventTracker.trackAll($scope);}, 0);
            } 
            catch (e) {
                template.open('page', 'errors/e404');
            }
        };

        $scope.search = async (text: string) => {
            if (text.trim().length > 2) {
                $scope.state.searchFailed = false;
                $scope.state.searching = true;
                $scope.state.emptyMessage = lang.translate('no.result');
                setTimeout(async function () {
                    await Conversation.instance.currentFolder.search(text);
                    $scope.$apply();
                }, 1);
            } else {
                $scope.state.searchFailed = true;
            }
        }

        $scope.cancelSearch = async () => {
            $scope.state.searching = false;
            $scope.state.searchFailed = false;
            setTimeout(async function () {
                await Conversation.instance.currentFolder.search("");
                $scope.$apply();
            }, 1);
        }

        $scope.filterUnread = async () => {
            setTimeout(async function () {
                await Conversation.instance.currentFolder.filterUnread($scope.state.filterUnread);
                $scope.$apply();
            }, 1);
        }

        $scope.isLoading = () => {
            return Conversation.instance.currentFolder.mails.loading;
        };

        $scope.nextMail = async (trash?: boolean) => {
            var mails = Conversation.instance.currentFolder.mails.all;
            var idx = mails.findIndex((mail) => { return mail.id === $scope.state.current.id });
            var nextMail = null;
            if (idx > -1 && idx < mails.length - 1)
                nextMail = mails[idx + 1];
            if (nextMail) {
                if (trash) {
                    setCurrentMail(nextMail, true);
                    await nextMail.open();
                    $scope.$apply();
                } else {
                    $scope.variableMailAction(nextMail);
                }
            }
            if (idx === mails.length - 2 && nextMail.count > mails.length) {
                await Conversation.instance.currentFolder.nextPage($scope.state.selectAll);
                $scope.$apply();
            }
        }

        $scope.previousMail = async (trash?: boolean) => {
            var mails = Conversation.instance.currentFolder.mails.all;
            var idx = mails.findIndex((mail) => { return mail.id === $scope.state.current.id });
            var previousMail = null;
            if (idx > -1 && idx > 0)
                previousMail = mails[idx - 1];
            if (previousMail) {
                if (trash) {
                    setCurrentMail(previousMail, true);
                    await previousMail.open();
                    $scope.$apply();
                } else {
                    $scope.variableMailAction(previousMail);
                }
            }
        }

        $scope.transfer = async () => {
            template.open('main', 'mail-actions/write-mail');
            const mail = $scope.state.newItem as Mail;
            mail.parentConversation = $scope.mail;
            await mail.setMailContent($scope.mail, 'transfer', $compile, $sanitize, $scope, $scope.getSignature());
            await Conversation.instance.folders.draft.transfer(mail.parentConversation, $scope.state.newItem);
            $scope.ccCciShow = false;
            $scope.$apply();
        };

        $scope.reply = async (outbox?: boolean) => {
            template.open('main', 'mail-actions/write-mail');
            const mail = $scope.state.newItem as Mail;
            mail.parentConversation = $scope.mail;
            await mail.setMailContent($scope.mail, 'reply', $compile, $sanitize, $scope, $scope.getSignature());
            if (outbox)
                mail.to = $scope.mail.to;
            else
                $scope.addUser($scope.mail.sender());
            $scope.ccCciShow = false;
            $scope.$apply();
        };

        $scope.replyAll = async () => {
            template.open('main', 'mail-actions/write-mail');
            const mail = $scope.state.newItem as Mail;
            mail.parentConversation = $scope.mail;
            await mail.setMailContent($scope.mail, 'reply', $compile, $sanitize, $scope, $scope.getSignature(), true);
            if ($scope.mail.sender().id !== model.me.userId)
                mail.to = _.filter($scope.state.newItem.to, function (user) { return user.id !== model.me.userId })
            if (!_.findWhere($scope.state.newItem.to, { id: $scope.mail.sender().id })) {
                $scope.addUser($scope.mail.sender());
            }

            $scope.ccCciShow = (mail.cc.length || mail.cci.length);
            $scope.$apply();
        };

        $scope.editDraft = async (draft: Mail) => {
            template.open('main', 'mail-actions/write-mail');
            window.scrollTo(0, 0);
            $scope.state.newItem = draft;
            await draft.open();
            $scope.ccCciShow = (draft.cc.length || draft.cci.length);
            $scope.$apply();
        };

        $scope.quickSaveDraft = async () => {
            $scope.saveDraft($scope.state.newItem);
        };

        $scope.hourIsit = () => $scope.state.draftSaveDate.format('HH');
        $scope.minIsit = () => $scope.state.draftSaveDate.format('mm');
        $scope.secIsit = () => $scope.state.draftSaveDate.format(':ss');

        $scope.saveDraft = async (item) => {
            try {
                await Conversation.instance.folders.draft.saveDraft(item);
                $scope.state.draftError = false;
                $scope.state.draftSaveDate = moment();
            }
            catch (e) {
                $scope.state.draftError = true;
                console.error(e);
            }
        };

        $scope.saveDraftAuto = async () => {
            if (!$scope.draftSavingFlag) {
                $scope.draftSavingFlag = true;
                var temp = $scope.state.newItem;
                setTimeout(async function () {
                    if (!$scope.sending && temp.state != "SENT") {
                        $scope.saveDraft(temp);
                    }
                    $scope.draftSavingFlag = false;
                }, 60000)
            }
        };

        $scope.checkWarnAboutCommunicationRules = () => {
            // Check if the recipients are groups of -or many different- relatives.
            let count = 0;
            let to: Array<User> = $scope.state.newItem.to || [];
            let cc: Array<User> = $scope.state.newItem.cc || [];
            to.concat(cc).map( (user) => {
                if( user.profile=="Relative" || user.profile=="Manual" ) {
                    count += user.isGroup ? 2 : 1;
                }
            });
            
            // If 2+ relatives are recipients, then this is a group message which may bypass communication rules.
            // => Relatives will be able to reply to the whole group, so let's display a warning !
            if( count > 1 ) {
                $scope.showWarnAboutCommunicationRules = true;
            }
        };

        $scope.agreedCommunicationRules = (visible) => {
            if( !visible ) {
                $scope.showWarnAboutCommunicationRules = false;
                // Also, don't display this warning not anymore: but this is managed by the infotip class directly.
            }
        };

        $scope.refreshSignature = async (use: boolean) => {
            Conversation.instance.putPreference();
            var body = $($scope.state.newItem.body);
            var signature = $scope.getSignature();
            if (body.filter('.new-signature').length > 0) {
                body.filter('.new-signature').text('');
                if (use)
                    body.filter('.new-signature').append(signature);
                $scope.state.newItem.body = _.map(body, function (el) { return el.outerHTML; }).join('');
            } else {
                $scope.state.newItem.setMailSignature(signature);
            }
        }

        $scope.result = {};

        $scope.sendMail = async () => {
            $scope.sending = true; //Blocks submit button while message hasn't been send
            const mail: Mail = $scope.state.newItem;
            $scope.result = await mail.send();
            $scope.state.newItem = new Mail();
            $scope.state.newItem.setMailSignature($scope.getSignature());
            await $scope.openFolder(Conversation.instance.folders.inbox.folderName);
            await Conversation.instance.folders.draft.countTotal();
            $scope.sending = false;
        };


        $scope.restore = async () => {
            await Conversation.instance.folders.trash.restore();
            await $scope.refreshFolders();
            await Conversation.instance.folders.draft.mails.refresh();
            await Conversation.instance.folders.inbox.countUnread();
            await $scope.userFolders.countUnread();
            await Conversation.instance.folders.draft.countTotal();
            $scope.state.selectAll = false;
            $scope.$apply();
        };

        $scope.removeSelection = async () => {
            await Conversation.instance.currentFolder.removeSelection();
            await Conversation.instance.currentFolder.countUnread();
            $scope.state.selectAll = false;
            $scope.$apply();
        };

        $scope.toggleUnreadSelection = async (unread) => {
            await Conversation.instance.currentFolder.toggleUnreadSelection(unread);
            $scope.state.selectAll = false;
            $scope.$apply();
        };

        $scope.canMarkUnread = () => {
            return Conversation.instance.currentFolder.mails.selection.selected.find(e => e.getSystemFolder() !== 'INBOX') == undefined &&
                Conversation.instance.currentFolder.mails.selection.selected.find(e => !e.unread)
        }

        $scope.canMarkRead = () => {
            return Conversation.instance.currentFolder.mails.selection.selected.find(e => e.getSystemFolder() !== 'INBOX') == undefined &&
                Conversation.instance.currentFolder.mails.selection.selected.find(e => e.unread)
        }

        $scope.allReceivers = function (mail) {
            var receivers = mail.to.slice(0);
            mail.toName && mail.toName.forEach(function (deletedReceiver) {
                receivers.push({
                    deleted: true,
                    displayName: deletedReceiver
                });
            });
            return receivers;
        }

        $scope.filterUsers = function (mail) {
            return function (user) {
                if (user.deleted) {
                    return true
                }
                var mapped = mail.map(user)
                return typeof mapped !== 'undefined' && typeof mapped.displayName !== 'undefined' && mapped.displayName.length > 0
            }
        }

        $scope.updateFoundUsers = async (search, model, founds, restriction?: boolean) => {
            var include = [];
            var exclude = model || [];
            if ($scope.mail) {
                include = _.map($scope.mail.displayNames, function (item) {
                    return new User(item[0], item[1]);
                });
            }
            var users = await Conversation.instance.users.findUser(search, include, exclude, restriction);
            Object.assign(founds, users, { length: users.length });
        };

        $scope.template = template
        $scope.lightbox = {}
        $scope.copyLightbox={};

        $scope.rootFolderTemplate = { template: 'folder-root-template' }
        $scope.refreshFolders = async () => {
            await $scope.userFolders.sync();
            await $scope.refreshFolder();
            $scope.rootFolderTemplate.template = ""
            $timeout(function () {
                $scope.$apply()
                $scope.rootFolderTemplate.template = 'folder-root-template'
            }, 100)
        }

        $scope.refreshFolder = async () => {
            await Conversation.instance.currentFolder.sync();
            $scope.state.selectAll = false;
            if (Conversation.instance.currentFolder instanceof UserFolder) {
                $scope.openUserFolder(Conversation.instance.currentFolder, {});
            }
            else
                $scope.updateWherami();
            $scope.$apply();
        }

        $scope.currentFolderDepth = function () {
            if (!($scope.currentFolder instanceof UserFolder))
                return 0

            return $scope.currentFolder.depth();
        }

        $scope.moveSelection = function () {
            $scope.destination = {}
            $scope.lightbox.show = true
            template.open('lightbox', 'move-mail')
        }

        $scope.safeApply = function (fn) {
            const phase = this.$root.$$phase;
            if (phase == '$apply' || phase == '$digest') {
                if (fn && (typeof (fn) === 'function')) {
                    fn();
                }
            } else {
                this.$apply(fn);
            }
        };

        $scope.moveToFolderClick = async (folder:UserFolder, obj) => {
            obj.template = ''
            const future = folder.syncUserFolders(true);
            $scope.safeApply();
            await future;
            if (folder.userFolders.all.length > 0) {
                $timeout(function () {
                    obj.template = 'move-folders-content'
                }, 10)
                return
            }

            //await folder.userFolders.sync();
            $timeout(function () {
                obj.template = 'move-folders-content'
            }, 10);
        }

        $scope.moveMessages = async (folderTarget) => {
            $scope.lightbox.show = false;
            template.close('lightbox');
            await Conversation.instance.currentFolder.mails.moveSelection(folderTarget);
            if (!(await $scope.countDraft(Conversation.instance.currentFolder, folderTarget))) {
                await Conversation.instance.currentFolder.countUnread();
                await folderTarget.countUnread();
            }
            await $scope.refreshFolder();
        }

        $scope.openNewFolderView = function () {
            $scope.newFolder = new UserFolder();
            if (Conversation.instance.currentFolder instanceof UserFolder) {
                $scope.newFolder.parentFolderId = (Conversation.instance.currentFolder as UserFolder).id;
            }

            $scope.lightbox.show = true
            template.open('lightbox', 'create-folder')
        }
        $scope.createFolder = async () => {
            await $scope.newFolder.create();
            await $scope.refreshFolders();
            $scope.lightbox.show = false;
            template.close('lightbox');
            $scope.$apply();
        }
        $scope.openRenameFolderView = function (folder, $event) {
            $event.stopPropagation();
            $scope.targetFolder = new UserFolder();
            $scope.targetFolder.name = folder.name;
            $scope.targetFolder.id = folder.id;
            $scope.lightbox.show = true;
            template.open('lightbox', 'update-folder');
        }
        $scope.updateFolder = async () => {
            await $scope.targetFolder.update();
            await $scope.refreshFolders();
            $scope.lightbox.show = false;
            template.close('lightbox');
            $scope.$apply();
        }
        $scope.isOpenedFolderRelativeTo = (relativeFolder: UserFolder, folder: UserFolder) => {
            return (relativeFolder && relativeFolder.id === folder.id) || $scope.isParentOf(folder, relativeFolder);
        }
        $scope.isOpenedFolder = (folder: UserFolder) => {
            return $scope.isOpenedFolderRelativeTo($scope.conversation.currentFolder, folder);
        }
        $scope.isClosedFolder = (folder: UserFolder) => {
            return !$scope.isOpenedFolder(folder);
        }
        $scope.trashFolder = async (folder: UserFolder) => {
            await folder.trash();
            await $scope.refreshFolders();
            await Conversation.instance.folders.trash.sync();
            await $scope.openFolder('trash');
        }
        $scope.restoreFolder = function (folder) {
            folder.restore().done(function () {
                $scope.refreshFolders();
            })
        }
        $scope.deleteFolder = function (folder) {
            folder.delete().done(function () {
                $scope.refreshFolders()
            })
        }

        var letterIcon = document.createElement("img")
        letterIcon.src = skin.theme + "../../img/icons/message-icon.png"
        $scope.drag = function (item, $originalEvent) {
            var selected = [];
            $scope.state.dragFolder = Conversation.instance.currentFolder;
            if (Conversation.instance.currentFolder.mails.selection.selected.indexOf(item) > -1)
                selected = Conversation.instance.currentFolder.mails.selection.selected;
            else
                selected.push(item);

            $originalEvent.dataTransfer.setDragImage(letterIcon, 0, 0);
            try {
                $originalEvent.dataTransfer.setData('application/json', JSON.stringify(selected));
            } catch (e) {
                $originalEvent.dataTransfer.setData('Text', JSON.stringify(selected));
            }
        };
        $scope.dropCondition = function (targetItem) {
            return function (event) {
                let dataField = event.dataTransfer.types.indexOf && event.dataTransfer.types.indexOf("application/json") > -1 ? "application/json" : //Chrome & Safari
                    event.dataTransfer.types.contains && event.dataTransfer.types.contains("application/json") ? "application/json" : //Firefox
                        event.dataTransfer.types.contains && event.dataTransfer.types.contains("Text") ? "Text" : //IE
                            undefined;

                if (targetItem.foldersName && targetItem.foldersName !== 'trash')
                    return undefined;

                return dataField;
            }
        };

        $scope.dropTo = function (targetItem, $originalEvent) {
            var dataField = $scope.dropCondition(targetItem)($originalEvent)
            var originalItems = JSON.parse($originalEvent.dataTransfer.getData(dataField))
            if (targetItem.folderName === 'trash')
                $scope.dropTrash(originalItems);
            else
                $scope.dropMove(originalItems, targetItem);
        };

        $scope.removeMail = async () => {
            await $scope.mail.remove();
            $scope.openFolder();
        }

        $scope.dropMove = async (mails, folder) => {
            var mailObj;
            for (let mail of mails) {
                mailObj = new Mail(mail.id);
                await mailObj.move(folder);
                $scope.$apply();
            }

            if (!(await $scope.countDraft($scope.state.dragFolder, folder))) {
                await folder.countUnread();
                await $scope.state.dragFolder.countUnread();
            }
            $scope.$apply();
        }

        $scope.dropTrash = async mails => {
            var mailObj;
            for (let mail of mails) {
                mailObj = new Mail(mail.id);
                await mailObj.trash();
                $scope.$apply();
            }

            if (!(await $scope.countDraft($scope.state.dragFolder, $scope.state.dragFolder))) {
                await $scope.state.dragFolder.countUnread();
            }
            $scope.$apply();
        }

        //Given a data size in bytes, returns a more "user friendly" representation.
        $scope.getAppropriateDataUnit = quota.appropriateDataUnit;

        $scope.formatSize = function (size) {
            var formattedData = $scope.getAppropriateDataUnit(size)
            return (Math.round(formattedData.nb * 10) / 10) + " " + formattedData.order
        }


        $scope.postAttachments = async () => {
            const mail = $scope.state.newItem as Mail;
            if (!mail.id) {
                await Conversation.instance.folders.draft.saveDraft(mail);
                await mail.postAttachments($scope);
            } else {
                await mail.postAttachments($scope);
            }
        }

        $scope.deleteAttachment = function (event, attachment, mail) {
            mail.deleteAttachment(attachment);
        }

        $scope.quota = quota;

        $scope.countDraft = async (folderSource, folderTarget) => {
            var draft = (folderSource.getName() === 'DRAFT' || folderTarget.getName() === 'DRAFT');
            if (draft)
                await Conversation.instance.folders.draft.countTotal();
            return draft;
        }

        $scope.emptyTrash = async () => {
            $scope.lightbox.show = true;
            template.open('lightbox', 'empty-trash');
        }

        $scope.removeTrashMessages = async () => {
            try{
                $scope.lightbox.show = false;
                await Conversation.instance.folders.trash.removeAll();
                await $scope.refreshFolders();
                await Conversation.instance.folders.trash.countUnread();
            }finally{
                $scope.$apply();
            }
        }

        $scope.updateWherami = () => {
            $timeout(function () {
                $('body').trigger('whereami.update');
            }, 100);
        }

        $scope.isLocalAdmin = () => {
            return model.me.functions &&
                model.me.functions.ADMIN_LOCAL && model.me.functions.ADMIN_LOCAL.scope
        };

        $scope.getAvatar = function () {
            return skin.theme + "../../" + $scope.defaultAvatar;
        }

        $scope.showConversationHistory = function () {
            if ($scope.isSlided) {
                $scope.messageHistory = lang.translate('message.history.show');
            }
            else {
                $scope.messageHistory = lang.translate('message.history.hide');
            }
            $scope.isSlided = !$scope.isSlided;
        }
    }]);
