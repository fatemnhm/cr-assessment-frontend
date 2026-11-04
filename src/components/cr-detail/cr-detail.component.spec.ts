import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CrDetailComponent } from './cr-detail.component';
import { SessionService } from '../../session/session.service';
import { users } from '../../api/fixtures';
import { ReqUser } from '../../models/cr.models';
import { CrApiService } from '../../api/cr-api.service';

const flush = () => new Promise((r) => setTimeout(r, 0));

async function render(user: ReqUser, id: string): Promise<ComponentFixture<CrDetailComponent>> {
	TestBed.configureTestingModule({
		imports: [CrDetailComponent],
		providers: [{ provide: SessionService, useValue: { user } }],
	});
	await TestBed.compileComponents();
	const fixture = TestBed.createComponent(CrDetailComponent);
	fixture.componentInstance.id = id;
	fixture.detectChanges(); // ngOnInit -> load()
	await flush(); // let the mock API resolve
	fixture.detectChanges(); // render the loaded state
	return fixture;
}

describe('CrDetailComponent', () => {
	it('loads and renders the change request title', async () => {
		const fixture = await render(users.approver, 'CR-1');
		expect(fixture.nativeElement.querySelector('.cr-detail__header h2').textContent).toContain('Add 1 unit of SKU-A');
	});

	it('disables Approve for a read-only viewer on a pending CR', async () => {
		const fixture = await render(users.viewer, 'CR-1');
		const approveBtn: HTMLButtonElement = fixture.nativeElement.querySelector('.cr-actions__approve');
		expect(approveBtn.disabled).toBe(true);
	});

	it('renders the timeline oldest first', async () => {
		const fixture = await render(users.approver, 'CR-1');
		const actions = Array.from(fixture.nativeElement.querySelectorAll('.cr-timeline__action')).map((el: any) => el.textContent.trim());
		expect(actions).toEqual(['CREATE', 'SUBMIT', 'SEND_FOR_APPROVAL']);
	});

	it('marks the quantity change on CR-1 as changed in the diff', async () => {
		const fixture = await render(users.approver, 'CR-1');
		const row = fixture.nativeElement.querySelector('.cr-diff__row[data-kind="changed"]');
		expect(row.textContent).toContain('SKU-A');
	});

	it('offers no enabled actions to a read-only viewer', async () => {
		const fixture = await render(users.viewer, 'CR-1');
		expect(fixture.nativeElement.querySelector('.cr-actions__approve').disabled).toBe(true);
		expect(fixture.nativeElement.querySelector('.cr-actions__reject-btn')).toBeNull();
	});

	it('disables Approve on a CR that is not pending', async () => {
		const fixture = await render(users.approver, 'CR-2');
		expect(fixture.nativeElement.querySelector('.cr-actions__approve').disabled).toBe(true);
	});

	it('approves a pending CR and updates status and timeline', async () => {
		const fixture = await render(users.approver, 'CR-1');
		fixture.nativeElement.querySelector('.cr-actions__approve').click();
		await flush();
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelector('.cr-detail__header .cr-status').textContent).toContain('APPROVED');
		expect(fixture.nativeElement.querySelector('.cr-actions__approve').disabled).toBe(true);
		const actions = fixture.nativeElement.querySelectorAll('.cr-timeline__action');
		expect(actions[actions.length - 1].textContent).toContain('APPROVE');
	});

	it('refreshes the CR after a failed approve so a retry cannot approve twice', async () => {
		const fixture = await render(users.approver, 'CR-1');
		TestBed.inject(CrApiService).failNext = true;
		fixture.nativeElement.querySelector('.cr-actions__approve').click();
		await flush();
		await flush();
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelector('.cr-actions__error').textContent).toContain("Couldn't confirm the approval");
		expect(fixture.nativeElement.querySelector('.cr-detail__header .cr-status').textContent).toContain('APPROVED');
		expect(fixture.nativeElement.querySelector('.cr-actions__approve').disabled).toBe(true);
	});

	it('sends only one approve when clicked twice while in flight', async () => {
		const fixture = await render(users.approver, 'CR-1');
		const api = TestBed.inject(CrApiService);
		const spy = jest.spyOn(api, 'approve');
		const btn = fixture.nativeElement.querySelector('.cr-actions__approve');
		btn.click();
		btn.click();
		expect(spy).toHaveBeenCalledTimes(1);
	});

	it('blocks Reject until a non-blank reason is entered', async () => {
		const fixture = await render(users.approver, 'CR-1');
		const textarea: HTMLTextAreaElement = fixture.nativeElement.querySelector('.cr-actions__reason');
		const rejectBtn: HTMLButtonElement = fixture.nativeElement.querySelector('.cr-actions__reject-btn');
		expect(rejectBtn.disabled).toBe(true);
		textarea.value = '   ';
		textarea.dispatchEvent(new Event('input'));
		fixture.detectChanges();
		expect(rejectBtn.disabled).toBe(true);
		textarea.value = 'Over budget';
		textarea.dispatchEvent(new Event('input'));
		fixture.detectChanges();
		expect(rejectBtn.disabled).toBe(false);
	});

	it('rejects with a trimmed reason and shows it in the timeline', async () => {
		const fixture = await render(users.approver, 'CR-1');
		const textarea: HTMLTextAreaElement = fixture.nativeElement.querySelector('.cr-actions__reason');
		textarea.value = '  Over budget  ';
		textarea.dispatchEvent(new Event('input'));
		fixture.detectChanges();
		fixture.nativeElement.querySelector('.cr-actions__reject-btn').click();
		await flush();
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelector('.cr-detail__header .cr-status').textContent).toContain('REJECTED');
		const notes = fixture.nativeElement.querySelectorAll('.cr-timeline__note');
		expect(notes[notes.length - 1].textContent).toBe('Over budget');
	});
});
