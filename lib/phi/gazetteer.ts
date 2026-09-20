/**
 * Common US given names and surnames, for full-name detection only.
 *
 * Read the caveat in `names.ts` first. A gazetteer used on BARE tokens is
 * unusable in a clinical corpus: the same list that catches "Nguyen" catches
 * Parkinson, Graves, Baker and Smith, and stripping those from a diagnosis
 * produces a confidently wrong screening. This list is therefore never
 * consulted for a single token. It is only used to recognise a given name
 * IMMEDIATELY followed by a surname -- "john smith" -- which is a shape that
 * essentially never occurs in clinical prose but is exactly what someone types
 * into a Diagnosis box when they mean the patient.
 *
 * Lists are deliberately short and high-frequency rather than exhaustive. The
 * long tail of surnames is not reachable this way and is not meant to be; the
 * soft-flag path and the reviewer cover it.
 */

const split = (s: string) => new Set(s.split(/\s+/).filter(Boolean));

export const GIVEN_NAMES = split(`
james robert john michael david william richard joseph thomas charles
christopher daniel matthew anthony mark donald steven paul andrew joshua
kenneth kevin brian george timothy ronald jason edward jeffrey ryan jacob
gary nicholas eric jonathan stephen larry justin scott brandon benjamin
samuel gregory alexander patrick frank raymond jack dennis jerry tyler aaron
jose adam nathan henry zachary douglas peter kyle noah ethan jeremy walter
christian keith roger terry austin sean gerald carl harold dylan arthur
lawrence jordan jesse bryan billy bruce gabriel joe logan alan juan albert
willie elijah wayne randy vincent mason roy ralph bobby russell bradley
philip eugene carlos luis miguel pedro jorge ricardo eduardo javier
mary patricia jennifer linda elizabeth barbara susan jessica sarah karen
lisa nancy betty margaret sandra ashley kimberly emily donna michelle carol
amanda dorothy melissa deborah stephanie rebecca sharon laura cynthia
kathleen amy angela shirley anna brenda pamela emma nicole helen samantha
katherine christine debra rachel carolyn janet catherine maria heather diane
olivia julie joyce victoria ruth virginia lauren kelly christina joan evelyn
judith andrea hannah megan cheryl jacqueline martha madison teresa gloria
sara janice ann kathryn abigail sophia frances jean alice judy isabella
julia grace amber denise danielle marilyn beverly charlotte natalie theresa
diana brittany doris kayla alexis lori marie carmen rosa ana sofia
`);

export const SURNAMES = split(`
smith johnson williams brown jones garcia miller davis rodriguez martinez
hernandez lopez gonzalez wilson anderson thomas taylor moore jackson martin
lee perez thompson white harris sanchez clark ramirez lewis robinson walker
young allen king wright scott torres nguyen hill flores green adams nelson
baker hall rivera campbell mitchell carter roberts gomez phillips evans
turner diaz parker cruz edwards collins reyes stewart morris morales murphy
cook rogers gutierrez ortiz morgan cooper peterson bailey reed kelly howard
ramos kim cox ward richardson watson brooks chavez wood james bennett gray
mendoza ruiz hughes price alvarez castillo sanders patel myers long ross
foster jimenez powell jenkins perry russell sullivan bell coleman butler
henderson barnes gonzales fisher vasquez simmons romero jordan patterson
alexander hamilton graham reynolds griffin wallace moreno west cole hayes
bryant herrera gibson ellis tran medina aguilar stevens murray ford castro
marshall owens harrison fernandez mcdonald woods washington kennedy wells
vargas henry chen freeman webb tucker guzman burns crawford olson simpson
porter hunter gordon mendez silva shaw snyder mason dixon munoz hunt hicks
holmes palmer wagner black robertson boyd rose stone salazar fox warren
mills meyer rice schmidt garza daniels ferguson nichols stephens soto weaver
ryan gardner payne grant dunn kelley spencer hawkins arnold pierce vazquez
hansen peters santos hart bradley knight elliott cunningham duncan armstrong
hudson carroll lane riley andrews alvarado ray delgado berry perkins hoffman
johnston matthews pena richards contreras willis carpenter lawrence sandoval
guerrero george chapman rios estrada ortega watkins greene nunez wheeler
valdez harper burke larson santiago maldonado morrison franklin carlson
austin dominguez carr lawson jacobs obrien lynch singh vega bishop montgomery
oliver jensen harvey williamson gilbert dean sims espinoza howell li wong
reid hanson le mccoy garrett burton fuller wang weber welch rojas lucas
marquez fields park yang little banks padilla day walsh bowman schultz
luna fowler mejia davidson acosta brewer may holland juarez newman pearson
curtis cortez douglas schneider joseph barrett navarro figueroa keller avila
`);
