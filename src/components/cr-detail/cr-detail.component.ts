import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { CrApiService } from '../../api/cr-api.service';
import { SessionService } from '../../session/session.service';
import { CrDetail, TimelineEntry } from '../../models/cr.models';
import { idle, loading, ViewState } from '../../common/view-state';
import { computeDiff, DiffRow } from '../diff.util';
import { formatMoney } from '../../common/money.util';
import { canApprovePolicy } from '../../common/permissions';

/**
 * Change Request DETAIL page: loads a CR and renders the diff/preview, the approval timeline, and
 * permission-aware Approve/Reject actions. `load`, the diff binding, and the template skeleton are
 * provided; the timeline ordering, permission gating, actions, and reject validation are yours.
 */
@Component({
	selector: 'app-cr-detail',
	standalone: true,
	imports: [CommonModule, ReactiveFormsModule],
	templateUrl: './cr-detail.component.html',
})
export class CrDetailComponent implements OnInit {
	@Input() id!: string;

	state: ViewState<CrDetail> = idle();
	submitting = false;
	actionError?: string;

	rejectControl = new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(/\S/)] });

	constructor(private readonly api: CrApiService, private readonly session: SessionService) {}

	ngOnInit(): void {
		void this.load();
	}

	async load(): Promise<void> {
		this.state = loading();
		this.actionError = undefined;
		try {
			const detail = await this.api.getChangeRequest(this.session.user, this.id);
			this.state = { status: 'loaded', data: detail };
		} catch (err) {
			this.state = { status: 'error', data: null, error: (err as Error).message };
		}
	}

	get detail(): CrDetail | null {
		return this.state.data;
	}

	get diff(): DiffRow[] {
		return this.detail ? computeDiff(this.detail.baselineLineItems, this.detail.proposedLineItems) : [];
	}

	/** Approval timeline, oldest-first. */
	get timeline(): TimelineEntry[] {
		return this.detail?.audit.slice().sort((a, b) => a.at.localeCompare(b.at)) ?? [];
	}

	private get canDecide(): boolean {
		// NOTE: this only looks at the CR status. The UI must also respect the user's permissions.
		const detail = this.detail;
		const user = this.session.user;
		return !!detail && detail.status === 'PENDING_APPROVAL' && detail.orgCode === user.orgCode && canApprovePolicy(user);
	}
	get canApprove(): boolean {
		// NOTE: this only looks at the CR status. The UI must also respect the user's permissions.
		return this.canDecide;
	}

	get canReject(): boolean {
		return this.canDecide;
	}

	fmt(amount: number): string {
		return this.detail ? formatMoney(amount, this.detail.currency) : String(amount);
	}

	async approve(): Promise<void> {
		if (!this.canApprove) return;
		await this.runAction('approve', (at) => this.api.approve(this.session.user, this.id, at));
	}

	async reject(): Promise<void> {
		this.rejectControl.markAsTouched();
		if (!this.canReject || this.rejectControl.invalid) return;
		const reason = this.rejectControl.value.trim();
		const ok = await this.runAction('reject', (at) => this.api.reject(this.session.user, this.id, at, reason));
		if (ok) this.rejectControl.reset();
	}

	/**
	 * Shared action flow. Ignores a second call while one is in flight (double-click guard), keeps the
	 * loaded CR on screen if the call fails, and only applies the result if the user is still on the same CR.
	 */
	private async runAction(label: string, call: (at: string) => Promise<CrDetail>): Promise<boolean> {
		if (this.submitting) return false;
		const id = this.id;
		this.submitting = true;
		this.actionError = undefined;
		try {
			const updated = await call(new Date().toISOString());
			if (id !== this.id) return false;
			this.state = { status: 'loaded', data: updated };
			return true;
		} catch (err) {
			if (id === this.id) this.actionError = `Couldn't ${label} this change request: ${(err as Error).message}. Nothing was changed.`;
			return false;
		} finally {
			this.submitting = false;
		}
	}
}
