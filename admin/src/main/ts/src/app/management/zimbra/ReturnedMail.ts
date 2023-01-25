export class ReturnedMail {
    id?: number;
    user_id: string;
    user_name: string;
    structure_id: string;
    object: string;
    number_message: number;
    statut: string;
    statutDisplayed: string;
    comment: string;
    recipient: object;
    date: string;
    estimatedTime: string;
    nb_message_success: number;

    constructor() {
        this.date = '';
        this.estimatedTime = '';
        this.number_message = 0;
        this.nb_message_success = 0;
        this.recipient = undefined;
        this.statut = '';
        this.statutDisplayed = '';
        this.structure_id = '';
        this.user_id = '';
        this.user_name = '';
        this.id = 0;
        this.comment = '';
        this.object = '';
    }

    public get progress(): number {
        return Math.round((this.nb_message_success / this.number_message) * 100);
    }
}

export interface ReturnedMailStatut {
    id: number;
    statut: string;
    date: string;
}
