import { getAccountWithPolicy } from '../accountService.js'
import { LOCAL_OPERATOR_ACCOUNT_ID } from '../policyDefaults.js'

export function resolveApiActor() {
	const account = getAccountWithPolicy(LOCAL_OPERATOR_ACCOUNT_ID)

	return {
		accountId: LOCAL_OPERATOR_ACCOUNT_ID,
		account
	}
}
