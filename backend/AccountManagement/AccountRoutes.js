import * as Accounts from './AccountController.js';
import express from "express";

const router = express.Router();

router.post('/', Accounts.createAccount);
router.get('/', Accounts.listAccounts);
router.get('/:id', Accounts.getAccount);
router.patch('/:id', Accounts.updateAccount);
router.post('/:id/archive', Accounts.archiveAccount);
router.post('/:id/unarchive', Accounts.unarchiveAccount);
router.delete('/:id', Accounts.deleteAccount);
router.post('/transfer', Accounts.createTransfer);
router.post('/:bankId/deposit', Accounts.depositToBank);
router.post('/:bankId/withdraw', Accounts.withdrawFromBank);

export default router;
