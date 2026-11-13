// "translation" (varsayılan) ad alanı: modül parçaları tek anahtar ağacında birleşir.
// Anahtar ağacı eski tek dosya i18n.ts ile birebir aynıdır; t("finance.title") gibi çağrılar değişmez.
import account from "./account";
import audit from "./audit";
import common from "./common";
import crm from "./crm";
import customs from "./customs";
import driver from "./driver";
import error from "./error";
import finance from "./finance";
import fleet from "./fleet";
import forbidden from "./forbidden";
import forgot from "./forgot";
import home from "./home";
import integrations from "./integrations";
import login from "./login";
import moduleTexts from "./module";
import nav from "./nav";
import notFound from "./notFound";
import operations from "./operations";
import permissions from "./permissions";
import reports from "./reports";
import roles from "./roles";
import saas from "./saas";
import setPassword from "./setPassword";
import subscription from "./subscription";
import tracking from "./tracking";
import users from "./users";
import warehouse from "./warehouse";

export default {
  appName: "Blackrose Nakliye",
  common,
  nav,
  home,
  module: moduleTexts,
  login,
  tracking,
  forgot,
  setPassword,
  users,
  roles,
  permissions,
  audit,
  account,
  finance,
  crm,
  operations,
  driver,
  subscription,
  saas,
  reports,
  integrations,
  customs,
  warehouse,
  fleet,
  forbidden,
  notFound,
  error,
};
