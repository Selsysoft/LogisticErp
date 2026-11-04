package org.ece.blackrose.tenant;

import jakarta.servlet.http.HttpServletRequest;
import java.util.Optional;

/** İstekten tenant kodunu çözer. Birden çok kaynak varsa hepsi aynı tenant'ı göstermelidir. */
public interface TenantResolver {

  Optional<String> resolve(HttpServletRequest request);
}
