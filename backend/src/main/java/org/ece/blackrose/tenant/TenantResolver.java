package org.ece.blackrose.tenant;

import jakarta.servlet.http.HttpServletRequest;
import java.util.Optional;

/** İstekten tenant kodunu çözer. JWT claim çözümleyicisi Faz 1'de bu arayüze eklenecek. */
public interface TenantResolver {

  Optional<String> resolve(HttpServletRequest request);
}
