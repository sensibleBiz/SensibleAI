import {
  BONUS_RULE_MASTER,
  ESI_RULE_MASTER,
  GRATUITY_RULE_MASTER,
  LEAVE_LOP_RULE_MASTER,
  OT_RULE_MASTER,
  PF_RULE_MASTER,
  TDS_RULE_MASTER,
} from "./centralRules.js";
import { SALARY_COMPONENT_RULE_MASTER } from "./salaryComponentRules.js";
import type { PayrollSettings } from "../types.js";

export { LWF_STATE_RULE_MASTER } from "./lwfStateRules.js";
export {
  findMinimumWageRule,
  MINIMUM_WAGE_RULE_MASTER,
} from "./minimumWageRules.js";
export { NON_PT_STATES, PT_STATE_SLAB_MASTER } from "./ptStateSlabs.js";
export {
  BONUS_RULE_MASTER,
  ESI_RULE_MASTER,
  GRATUITY_RULE_MASTER,
  LEAVE_LOP_RULE_MASTER,
  OT_RULE_MASTER,
  PF_RULE_MASTER,
  TDS_RULE_MASTER,
} from "./centralRules.js";
export {
  EMPTY_SALARY_EARNINGS,
  SALARY_COMPONENT_RULE_MASTER,
  SAMPLE_SALARY_EARNINGS,
} from "./salaryComponentRules.js";

export const PAYROLL_RULE_MASTER: PayrollSettings = {
  pf: PF_RULE_MASTER,
  esi: ESI_RULE_MASTER,
  bonus: BONUS_RULE_MASTER,
  gratuity: GRATUITY_RULE_MASTER,
  ot: OT_RULE_MASTER,
  leave: LEAVE_LOP_RULE_MASTER,
  salaryComponents: SALARY_COMPONENT_RULE_MASTER,
  tds: TDS_RULE_MASTER,
};
